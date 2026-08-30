export interface Disposable {
  dispose(): void;
}

export type TomlVersion = "1.0" | "1.1";
export type LineEnding = "preserve" | "lf" | "crlf";
export type GeneratedFilesPolicy = "skip" | "format";

export interface FormatSettings {
  // undefined means "follow the editor tab size": the server falls back to
  // the per-request FormattingOptions.tabSize only when indentWidth is absent.
  indentWidth: number | undefined;
  lineWidth: number;
  lineEnding: LineEnding;
  generatedFiles: GeneratedFilesPolicy;
}

export interface ExtensionSettings {
  serverPath: string;
  // True when any user-scope configuration value overrides the manifest
  // default; only an explicit setting takes priority over a bundled server.
  serverPathExplicitlySet: boolean;
  serverArguments: readonly string[];
  serverEnvironment: Readonly<Record<string, string>>;
  tomlVersion: TomlVersion;
  format: FormatSettings;
}

export interface ConfigurationChange {
  affectsServerLaunch: boolean;
}

export type ServerState = "starting" | "running" | "stopped" | "failed";

export interface ServerStatus {
  state: ServerState;
  detail?: string;
}

export interface ExtensionHost {
  readonly environment: Readonly<Record<string, string | undefined>>;
  // Absolute path of the platform-specific server binary packaged with the
  // extension, or undefined when none is bundled. Read again at every launch
  // so the host can reflect the current install contents.
  readonly bundledServerPath: string | undefined;

  readSettings(): ExtensionSettings;
  onDidChangeConfiguration(
    listener: (change: ConfigurationChange) => Promise<void>,
  ): Disposable;
  registerCommand(command: string, handler: () => Promise<void>): Disposable;
  showError(message: string): void;
  showStartupError(message: string): void;
  updateStatus(status: ServerStatus): void;
}

export interface ServerLaunch {
  command: string;
  arguments: readonly string[];
  environment: Readonly<Record<string, string>>;
}

export interface ServerConfiguration {
  readonly tomlVersion: TomlVersion;
  readonly format: {
    readonly indentWidth?: number;
    readonly lineWidth: number;
    readonly lineEnding: LineEnding;
    readonly generatedFiles: GeneratedFilesPolicy;
  };
}

export interface ClientPlan {
  id: "tomlsmith";
  name: "TomlSmith";
  server: ServerLaunch;
  documents: readonly [
    { readonly language: "toml"; readonly scheme: "file" },
    { readonly language: "toml"; readonly scheme: "untitled" },
  ];
  // A supplier instead of a snapshot: the language client library re-runs
  // the initialize handshake when it restarts a crashed server, and options
  // captured at client-creation time would silently revert every setting
  // pushed through workspace/didChangeConfiguration since then.
  initializationOptions: () => ServerConfiguration;
}

export type ClientState = "starting" | "running" | "stopped";

export interface LanguageClient {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendNotification(method: string, params: unknown): Promise<void>;
  onDidChangeState?(listener: (state: ClientState) => void): Disposable;
}

export interface ClientFactory {
  create(plan: ClientPlan): LanguageClient;
}

export interface RunningExtension extends Disposable {
  restart(): Promise<void>;
  stop(): Promise<void>;
}

export async function startExtension(
  host: ExtensionHost,
  factory: ClientFactory,
): Promise<RunningExtension> {
  let client: LanguageClient | undefined;
  let clientStateSubscription: Disposable | undefined;
  let disposed = false;
  let lifecycle: Promise<void> = Promise.resolve();

  const schedule = (operation: () => Promise<void>): Promise<void> => {
    const scheduled = lifecycle.then(operation, operation);
    lifecycle = scheduled.catch(() => undefined);
    return scheduled;
  };

  const launch = async (): Promise<void> => {
    if (disposed) {
      return;
    }

    const settings = host.readSettings();
    const command = resolveServerCommand(settings, host.bundledServerPath);
    host.updateStatus({ state: "starting" });

    const nextClient = factory.create({
      id: "tomlsmith",
      name: "TomlSmith",
      server: {
        command,
        arguments: [...settings.serverArguments],
        environment: mergeEnvironment(
          host.environment,
          settings.serverEnvironment,
        ),
      },
      documents: [
        { language: "toml", scheme: "file" },
        { language: "toml", scheme: "untitled" },
      ],
      initializationOptions: () => serverConfiguration(host.readSettings()),
    });
    // Reflect state transitions the runtime did not initiate (a server crash
    // and any recovery by the client library) while the client stays active.
    const stateSubscription = nextClient.onDidChangeState?.((state) => {
      if (client === nextClient) {
        host.updateStatus({ state });
      }
    });
    try {
      await nextClient.start();
    } catch (error) {
      stateSubscription?.dispose();
      try {
        await nextClient.stop();
      } catch {
        // Preserve the start failure, which is the actionable error.
      }
      const message = error instanceof Error ? error.message : String(error);
      host.updateStatus({ state: "failed", detail: message });
      throw error;
    }

    if (disposed) {
      stateSubscription?.dispose();
      await nextClient.stop();
      return;
    }
    client = nextClient;
    clientStateSubscription = stateSubscription;
    host.updateStatus({ state: "running" });
  };

  const stopActiveClient = async (): Promise<void> => {
    const activeClient = client;
    client = undefined;
    clientStateSubscription?.dispose();
    clientStateSubscription = undefined;
    await activeClient?.stop();
    host.updateStatus({ state: "stopped" });
  };

  const restartNow = async (): Promise<void> => {
    try {
      await stopActiveClient();
      if (!disposed) {
        await launch();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      host.showError(`TomlSmith failed to restart: ${message}`);
      throw error;
    }
  };

  const pushConfigurationNow = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    if (!client) {
      // Preserve the failed-start recovery path: with no live client the
      // fresh settings can only take effect through a relaunch.
      await restartNow();
      return;
    }
    const settings = host.readSettings();
    try {
      await client.sendNotification("workspace/didChangeConfiguration", {
        settings: serverConfiguration(settings),
      });
    } catch {
      // A held but permanently stopped client (the library stops retrying
      // after repeated server crashes) rejects notifications; relaunching
      // is the only way the fresh settings can take effect.
      await restartNow();
    }
  };

  const restart = (): Promise<void> => schedule(restartNow);
  const stop = (): Promise<void> => schedule(stopActiveClient);
  const pushConfiguration = (): Promise<void> => schedule(pushConfigurationNow);

  const restartCommand = host.registerCommand(
    "tomlsmith.restartServer",
    restart,
  );
  const configurationListener = host.onDidChangeConfiguration((change) =>
    change.affectsServerLaunch ? restart() : pushConfiguration(),
  );

  try {
    await schedule(launch);
  } catch (error) {
    // Keep the restart command and the configuration listener alive so the
    // user can recover by fixing the settings: the next configuration change
    // or explicit restart relaunches the server (restartNow copes with an
    // undefined client). Reloading the window must never be the only way out.
    const message = error instanceof Error ? error.message : String(error);
    host.showStartupError(`TomlSmith failed to start: ${message}`);
  }

  return {
    restart,
    stop,
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      configurationListener.dispose();
      restartCommand.dispose();
      void stop();
    },
  };
}

// Resolution order: explicit setting -> bundled binary -> PATH lookup.
function resolveServerCommand(
  settings: ExtensionSettings,
  bundledServerPath: string | undefined,
): string {
  const configured = settings.serverPath.trim();
  if (settings.serverPathExplicitlySet && configured !== "") {
    return configured;
  }
  return bundledServerPath ?? (configured || "tomlsmith-lsp");
}

function serverConfiguration(settings: ExtensionSettings): ServerConfiguration {
  const { indentWidth, lineWidth, lineEnding, generatedFiles } =
    settings.format;
  return {
    tomlVersion: settings.tomlVersion,
    format: {
      // Omit the key entirely: the server treats a present indentWidth as an
      // override of the per-request FormattingOptions.tabSize fallback.
      ...(indentWidth === undefined ? {} : { indentWidth }),
      lineWidth,
      lineEnding,
      generatedFiles,
    },
  };
}

function mergeEnvironment(
  inherited: Readonly<Record<string, string | undefined>>,
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(inherited)) {
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  return { ...environment, ...overrides };
}
