import { describe, expect, test, vi } from "vitest";

import {
  startExtension,
  type ClientPlan,
  type ClientFactory,
  type ConfigurationChange,
  type ExtensionHost,
  type ExtensionSettings,
  type LanguageClient,
} from "../src/runtime";

describe("startExtension", () => {
  test("starts TomlSmith for TOML documents with the configured server and synchronized settings", async () => {
    const configurationListener = { dispose: vi.fn() };
    const commandHandlers = new Map<string, () => Promise<void>>();
    const onDidChangeConfiguration = vi.fn(() => configurationListener);
    const host: ExtensionHost = {
      environment: {
        PATH: "/usr/bin",
        RUST_LOG: "trace",
        TOMLSMITH_UNSET: undefined,
      },
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "/opt/tomlsmith/bin/tomlsmith-lsp",
        serverPathExplicitlySet: true,
        serverArguments: ["--stdio"],
        serverEnvironment: { RUST_LOG: "warn" },
        tomlVersion: "1.0",
        format: {
          indentWidth: 4,
          lineWidth: 120,
          lineEnding: "crlf",
          generatedFiles: "format",
        },
      }),
      onDidChangeConfiguration,
      registerCommand: (command, handler) => {
        commandHandlers.set(command, handler);
        return { dispose: vi.fn() };
      },
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };

    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi.fn((_plan: ClientPlan) => client);
    const factory: ClientFactory = { create };

    await startExtension(host, factory);

    expect(create).toHaveBeenCalledWith({
      id: "tomlsmith",
      name: "TomlSmith",
      server: {
        command: "/opt/tomlsmith/bin/tomlsmith-lsp",
        arguments: ["--stdio"],
        environment: { PATH: "/usr/bin", RUST_LOG: "warn" },
      },
      documents: [
        { language: "toml", scheme: "file" },
        { language: "toml", scheme: "untitled" },
      ],
      initializationOptions: expect.any(Function),
    });
    expect(create.mock.calls[0]?.[0].initializationOptions()).toEqual({
      tomlVersion: "1.0",
      format: {
        indentWidth: 4,
        lineWidth: 120,
        lineEnding: "crlf",
        generatedFiles: "format",
      },
    });
    expect(client.start).toHaveBeenCalledOnce();
    expect(commandHandlers.has("tomlsmith.restartServer")).toBe(true);
    expect(onDidChangeConfiguration).toHaveBeenCalledOnce();
  });

  test("resolves tomlsmith-lsp from PATH when no custom path is configured", async () => {
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "",
        serverPathExplicitlySet: false,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.1",
        format: {
          indentWidth: undefined,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi.fn((_plan: ClientPlan) => client);

    await startExtension(host, { create });

    expect(create.mock.calls[0]?.[0].server.command).toBe("tomlsmith-lsp");
  });

  test("omits the indentWidth key when unset and passes a configured integer through", async () => {
    let indentWidth: number | undefined;
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "/tools/tomlsmith-lsp",
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.0",
        format: {
          indentWidth,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi.fn((_plan: ClientPlan) => client);

    const running = await startExtension(host, { create });
    const unsetFormat =
      create.mock.calls[0]?.[0].initializationOptions().format;
    expect(unsetFormat).toBeDefined();
    expect(unsetFormat && "indentWidth" in unsetFormat).toBe(false);
    expect(unsetFormat?.generatedFiles).toBe("skip");

    indentWidth = 8;
    await running.restart();

    expect(
      create.mock.calls[1]?.[0].initializationOptions().format.indentWidth,
    ).toBe(8);
  });

  test("restarts with fresh server and language settings when the launch configuration changes", async () => {
    let settings: ExtensionSettings = {
      serverPath: "/tools/tomlsmith-lsp-v1",
      serverPathExplicitlySet: true,
      serverArguments: ["--old"],
      serverEnvironment: { GENERATION: "one" },
      tomlVersion: "1.1",
      format: {
        indentWidth: 2,
        lineWidth: 100,
        lineEnding: "preserve",
        generatedFiles: "skip",
      },
    };
    let configurationChanged:
      | ((change: ConfigurationChange) => Promise<void>)
      | undefined;
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => settings,
      onDidChangeConfiguration: (listener) => {
        configurationChanged = listener;
        return { dispose: vi.fn() };
      },
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    const lifecycle: string[] = [];
    const firstClient: LanguageClient = {
      start: vi.fn(async () => {
        lifecycle.push("start first");
      }),
      stop: vi.fn(async () => {
        lifecycle.push("stop first");
      }),
      sendNotification: vi.fn(async () => undefined),
    };
    const secondClient: LanguageClient = {
      start: vi.fn(async () => {
        lifecycle.push("start second");
      }),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi
      .fn<(plan: ClientPlan) => LanguageClient>()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);
    await startExtension(host, { create });
    settings = {
      serverPath: "/tools/tomlsmith-lsp-v2",
      serverPathExplicitlySet: true,
      serverArguments: ["--new"],
      serverEnvironment: { GENERATION: "two" },
      tomlVersion: "1.0",
      format: {
        indentWidth: 4,
        lineWidth: 120,
        lineEnding: "crlf",
        generatedFiles: "format",
      },
    };

    await configurationChanged?.({ affectsServerLaunch: true });

    expect(lifecycle).toEqual(["start first", "stop first", "start second"]);
    expect(create.mock.calls[1]?.[0]).toMatchObject({
      server: {
        command: "/tools/tomlsmith-lsp-v2",
        arguments: ["--new"],
        environment: { GENERATION: "two" },
      },
    });
    expect(create.mock.calls[1]?.[0].initializationOptions()).toEqual({
      tomlVersion: "1.0",
      format: {
        indentWidth: 4,
        lineWidth: 120,
        lineEnding: "crlf",
        generatedFiles: "format",
      },
    });
    expect(firstClient.sendNotification).not.toHaveBeenCalled();
  });

  test("pushes contract-shaped settings without restarting when only language settings change", async () => {
    let settings: ExtensionSettings = {
      serverPath: "/tools/tomlsmith-lsp",
      serverPathExplicitlySet: true,
      serverArguments: [],
      serverEnvironment: {},
      tomlVersion: "1.0",
      format: {
        indentWidth: 2,
        lineWidth: 100,
        lineEnding: "preserve",
        generatedFiles: "skip",
      },
    };
    let configurationChanged:
      | ((change: ConfigurationChange) => Promise<void>)
      | undefined;
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => settings,
      onDidChangeConfiguration: (listener) => {
        configurationChanged = listener;
        return { dispose: vi.fn() };
      },
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi.fn((_plan: ClientPlan) => client);
    await startExtension(host, { create });
    settings = {
      ...settings,
      tomlVersion: "1.1",
      format: { ...settings.format, indentWidth: undefined },
    };

    await configurationChanged?.({ affectsServerLaunch: false });

    expect(client.sendNotification).toHaveBeenCalledWith(
      "workspace/didChangeConfiguration",
      {
        settings: {
          tomlVersion: "1.1",
          format: {
            lineWidth: 100,
            lineEnding: "preserve",
            generatedFiles: "skip",
          },
        },
      },
    );
    const pushed = vi.mocked(client.sendNotification).mock.calls[0]?.[1] as {
      settings: { format: object };
    };
    expect("indentWidth" in pushed.settings.format).toBe(false);
    expect(create).toHaveBeenCalledOnce();
    expect(client.stop).not.toHaveBeenCalled();
  });

  test("the plan's initialization options supplier always reflects the current settings", async () => {
    let settings: ExtensionSettings = {
      serverPath: "/tools/tomlsmith-lsp",
      serverPathExplicitlySet: true,
      serverArguments: [],
      serverEnvironment: {},
      tomlVersion: "1.0",
      format: {
        indentWidth: 2,
        lineWidth: 100,
        lineEnding: "preserve",
        generatedFiles: "skip",
      },
    };
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => settings,
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi.fn((_plan: ClientPlan) => client);
    await startExtension(host, { create });
    settings = {
      ...settings,
      tomlVersion: "1.1",
      format: { ...settings.format, lineWidth: 80 },
    };

    // The language client library resolves the supplier on every initialize
    // handshake, including the one after an automatic crash restart; the
    // restarted server must see the settings pushed since client creation.
    expect(create.mock.calls[0]?.[0].initializationOptions()).toEqual({
      tomlVersion: "1.1",
      format: {
        indentWidth: 2,
        lineWidth: 80,
        lineEnding: "preserve",
        generatedFiles: "skip",
      },
    });
  });

  test("relaunches on a language settings change when the held client rejects the push", async () => {
    let configurationChanged:
      | ((change: ConfigurationChange) => Promise<void>)
      | undefined;
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "/tools/tomlsmith-lsp",
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.1",
        format: {
          indentWidth: undefined,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: (listener) => {
        configurationChanged = listener;
        return { dispose: vi.fn() };
      },
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    // The library gave up restarting a repeatedly crashing server: the
    // client is still held but permanently stopped, so notifications reject.
    let stateListener: ((state: "starting" | "running" | "stopped") => void) | undefined;
    const deadClient: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => {
        throw new Error("Client is not running");
      }),
      onDidChangeState: (listener) => {
        stateListener = listener;
        return { dispose: vi.fn() };
      },
    };
    const recoveredClient: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi
      .fn<(plan: ClientPlan) => LanguageClient>()
      .mockReturnValueOnce(deadClient)
      .mockReturnValueOnce(recoveredClient);
    await startExtension(host, { create });
    stateListener?.("stopped");

    await configurationChanged?.({ affectsServerLaunch: false });

    expect(deadClient.stop).toHaveBeenCalledOnce();
    expect(recoveredClient.start).toHaveBeenCalledOnce();
  });

  test("relaunches on a language settings change when no client is running", async () => {
    let serverPath = "/tools/broken/tomlsmith-lsp";
    let configurationChanged:
      | ((change: ConfigurationChange) => Promise<void>)
      | undefined;
    const showStartupError = vi.fn();
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath,
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.0",
        format: {
          indentWidth: undefined,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: (listener) => {
        configurationChanged = listener;
        return { dispose: vi.fn() };
      },
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError,
      updateStatus: vi.fn(),
    };
    const failedClient: LanguageClient = {
      start: vi.fn(async () => {
        throw new Error("spawn ENOENT");
      }),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const recoveredClient: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi
      .fn<(plan: ClientPlan) => LanguageClient>()
      .mockReturnValueOnce(failedClient)
      .mockReturnValueOnce(recoveredClient);
    await startExtension(host, { create });
    expect(showStartupError).toHaveBeenCalledOnce();
    serverPath = "/tools/fixed/tomlsmith-lsp";

    await configurationChanged?.({ affectsServerLaunch: false });

    expect(recoveredClient.start).toHaveBeenCalledOnce();
    expect(recoveredClient.sendNotification).not.toHaveBeenCalled();
    expect(create.mock.calls[1]?.[0].server.command).toBe(
      "/tools/fixed/tomlsmith-lsp",
    );
  });

  test("reports an automatic restart failure after reloading settings", async () => {
    let serverPath = "/tools/tomlsmith-lsp-v1";
    let configurationChanged:
      | ((change: ConfigurationChange) => Promise<void>)
      | undefined;
    const showError = vi.fn();
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath,
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.1",
        format: {
          indentWidth: 2,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: (listener) => {
        configurationChanged = listener;
        return { dispose: vi.fn() };
      },
      registerCommand: () => ({ dispose: vi.fn() }),
      showError,
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    const firstClient: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const failedClient: LanguageClient = {
      start: vi.fn(async () => {
        throw new Error("server exited");
      }),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi
      .fn<(plan: ClientPlan) => LanguageClient>()
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(failedClient);
    await startExtension(host, { create });
    serverPath = "/tools/tomlsmith-lsp-v2";

    await expect(
      configurationChanged?.({ affectsServerLaunch: true }),
    ).rejects.toThrow("server exited");

    expect(firstClient.stop).toHaveBeenCalledOnce();
    expect(create.mock.calls[1]?.[0].server.command).toBe(
      "/tools/tomlsmith-lsp-v2",
    );
    expect(showError).toHaveBeenCalledWith(
      "TomlSmith failed to restart: server exited",
    );
  });

  test("disposes the configuration listener with the running extension", async () => {
    const command = { dispose: vi.fn() };
    const configuration = { dispose: vi.fn() };
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "/tools/tomlsmith-lsp",
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.1",
        format: {
          indentWidth: 2,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: () => configuration,
      registerCommand: () => command,
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus: vi.fn(),
    };
    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const running = await startExtension(host, { create: () => client });

    running.dispose();

    expect(configuration.dispose).toHaveBeenCalledOnce();
    expect(command.dispose).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(client.stop).toHaveBeenCalledOnce());
  });

  test("recovers through a configuration change after the initial launch fails", async () => {
    let serverPath = "/tools/broken/tomlsmith-lsp";
    let configurationChanged:
      | ((change: ConfigurationChange) => Promise<void>)
      | undefined;
    const command = { dispose: vi.fn() };
    const configuration = { dispose: vi.fn() };
    const showError = vi.fn();
    const showStartupError = vi.fn();
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath,
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.1",
        format: {
          indentWidth: 2,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: (listener) => {
        configurationChanged = listener;
        return configuration;
      },
      registerCommand: () => command,
      showError,
      showStartupError,
      updateStatus: vi.fn(),
    };
    const failedClient: LanguageClient = {
      start: vi.fn(async () => {
        throw new Error("spawn ENOENT");
      }),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const recoveredClient: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };
    const create = vi
      .fn<(plan: ClientPlan) => LanguageClient>()
      .mockReturnValueOnce(failedClient)
      .mockReturnValueOnce(recoveredClient);

    const running = await startExtension(host, { create });

    expect(showStartupError).toHaveBeenCalledWith(
      "TomlSmith failed to start: spawn ENOENT",
    );
    expect(configuration.dispose).not.toHaveBeenCalled();
    expect(command.dispose).not.toHaveBeenCalled();

    serverPath = "/tools/fixed/tomlsmith-lsp";
    await configurationChanged?.({ affectsServerLaunch: true });

    expect(recoveredClient.start).toHaveBeenCalledOnce();
    expect(create.mock.calls[1]?.[0].server.command).toBe(
      "/tools/fixed/tomlsmith-lsp",
    );
    expect(showError).not.toHaveBeenCalled();

    running.dispose();
    expect(configuration.dispose).toHaveBeenCalledOnce();
    expect(command.dispose).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(recoveredClient.stop).toHaveBeenCalledOnce(),
    );
  });

  test("reports starting and running status while launching successfully", async () => {
    const updateStatus = vi.fn();
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "/tools/tomlsmith-lsp",
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.0",
        format: {
          indentWidth: undefined,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus,
    };
    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };

    await startExtension(host, { create: () => client });

    expect(updateStatus.mock.calls.map((call) => call[0])).toEqual([
      { state: "starting" },
      { state: "running" },
    ]);
  });

  test("reports a failed status with the launch error detail", async () => {
    const updateStatus = vi.fn();
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "/tools/broken/tomlsmith-lsp",
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.0",
        format: {
          indentWidth: undefined,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus,
    };
    const client: LanguageClient = {
      start: vi.fn(async () => {
        throw new Error("spawn ENOENT");
      }),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
    };

    await startExtension(host, { create: () => client });

    expect(updateStatus.mock.calls.map((call) => call[0])).toEqual([
      { state: "starting" },
      { state: "failed", detail: "spawn ENOENT" },
    ]);
  });

  test("shows a stopped status when the client stops without a runtime-initiated stop", async () => {
    const updateStatus = vi.fn();
    const host: ExtensionHost = {
      environment: {},
      bundledServerPath: undefined,
      readSettings: () => ({
        serverPath: "/tools/tomlsmith-lsp",
        serverPathExplicitlySet: true,
        serverArguments: [],
        serverEnvironment: {},
        tomlVersion: "1.0",
        format: {
          indentWidth: undefined,
          lineWidth: 100,
          lineEnding: "preserve",
          generatedFiles: "skip",
        },
      }),
      onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
      registerCommand: () => ({ dispose: vi.fn() }),
      showError: vi.fn(),
      showStartupError: vi.fn(),
      updateStatus,
    };
    let stateListener: ((state: "starting" | "running" | "stopped") => void) | undefined;
    const stateSubscription = { dispose: vi.fn() };
    const client: LanguageClient = {
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
      sendNotification: vi.fn(async () => undefined),
      onDidChangeState: (listener) => {
        stateListener = listener;
        return stateSubscription;
      },
    };
    const create = vi.fn((_plan: ClientPlan) => client);
    const running = await startExtension(host, { create });
    updateStatus.mockClear();

    stateListener?.("stopped");

    expect(updateStatus).toHaveBeenCalledWith({ state: "stopped" });
    expect(create).toHaveBeenCalledOnce();

    // A runtime-initiated stop disposes the subscription first, so the crash
    // reflection cannot race a deliberate shutdown.
    updateStatus.mockClear();
    await running.stop();
    expect(stateSubscription.dispose).toHaveBeenCalledOnce();
    expect(updateStatus).toHaveBeenCalledWith({ state: "stopped" });
  });

  describe("server command resolution", () => {
    async function resolveCommand(options: {
      serverPath: string;
      serverPathExplicitlySet: boolean;
      bundledServerPath: string | undefined;
    }): Promise<string | undefined> {
      const host: ExtensionHost = {
        environment: {},
        bundledServerPath: options.bundledServerPath,
        readSettings: () => ({
          serverPath: options.serverPath,
          serverPathExplicitlySet: options.serverPathExplicitlySet,
          serverArguments: [],
          serverEnvironment: {},
          tomlVersion: "1.0",
          format: {
            indentWidth: undefined,
            lineWidth: 100,
            lineEnding: "preserve",
            generatedFiles: "skip",
          },
        }),
        onDidChangeConfiguration: () => ({ dispose: vi.fn() }),
        registerCommand: () => ({ dispose: vi.fn() }),
        showError: vi.fn(),
        showStartupError: vi.fn(),
        updateStatus: vi.fn(),
      };
      const client: LanguageClient = {
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        sendNotification: vi.fn(async () => undefined),
      };
      const create = vi.fn((_plan: ClientPlan) => client);
      await startExtension(host, { create });
      return create.mock.calls[0]?.[0].server.command;
    }

    test("an explicitly configured path overrides the bundled server", async () => {
      await expect(
        resolveCommand({
          serverPath: " /custom/tomlsmith-lsp ",
          serverPathExplicitlySet: true,
          bundledServerPath: "/install/server/linux-x64/tomlsmith-lsp",
        }),
      ).resolves.toBe("/custom/tomlsmith-lsp");
    });

    test("the bundled server is preferred over the manifest default path", async () => {
      await expect(
        resolveCommand({
          serverPath: "tomlsmith-lsp",
          serverPathExplicitlySet: false,
          bundledServerPath: "/install/server/linux-x64/tomlsmith-lsp",
        }),
      ).resolves.toBe("/install/server/linux-x64/tomlsmith-lsp");
    });

    test("a blank explicit path yields to the bundled server", async () => {
      await expect(
        resolveCommand({
          serverPath: "   ",
          serverPathExplicitlySet: true,
          bundledServerPath: "/install/server/linux-x64/tomlsmith-lsp",
        }),
      ).resolves.toBe("/install/server/linux-x64/tomlsmith-lsp");
    });

    test("PATH lookup remains the fallback without an explicit path or bundled server", async () => {
      await expect(
        resolveCommand({
          serverPath: "tomlsmith-lsp",
          serverPathExplicitlySet: false,
          bundledServerPath: undefined,
        }),
      ).resolves.toBe("tomlsmith-lsp");
    });
  });
});
