import { existsSync } from "node:fs";
import * as path from "node:path";

import * as vscode from "vscode";
import {
  LanguageClient as NodeLanguageClient,
  State,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

import {
  startExtension,
  type ClientFactory,
  type ClientState,
  type ExtensionHost,
  type ExtensionSettings,
  type RunningExtension,
  type ServerState,
} from "./runtime";

let running: RunningExtension | undefined;

function serverPathExplicitlySet(
  configuration: vscode.WorkspaceConfiguration,
): boolean {
  const inspected = configuration.inspect("server.path");
  if (inspected === undefined) {
    return false;
  }
  // Any user-scope value counts; the manifest default does not. Restricted
  // Mode filters the workspace scopes of this setting out of get(), so
  // counting them here would disable the bundled-server preference without
  // the workspace value ever being used.
  const values = vscode.workspace.isTrusted
    ? [
        inspected.globalValue,
        inspected.workspaceValue,
        inspected.workspaceFolderValue,
        inspected.globalLanguageValue,
        inspected.workspaceLanguageValue,
        inspected.workspaceFolderLanguageValue,
      ]
    : [inspected.globalValue, inspected.globalLanguageValue];
  return values.some((value) => value !== undefined);
}

function readSettings(): ExtensionSettings {
  const configuration = vscode.workspace.getConfiguration("tomlsmith");
  const indentWidth = configuration.get<number | null>(
    "format.indentWidth",
    null,
  );
  return {
    serverPath: configuration.get("server.path", "tomlsmith-lsp"),
    serverPathExplicitlySet: serverPathExplicitlySet(configuration),
    serverArguments: configuration.get<string[]>("server.arguments", []),
    serverEnvironment: configuration.get<Record<string, string>>(
      "server.environment",
      {},
    ),
    tomlVersion: configuration.get<ExtensionSettings["tomlVersion"]>(
      "toml.version",
      "1.1",
    ),
    format: {
      indentWidth: indentWidth ?? undefined,
      lineWidth: configuration.get("format.lineWidth", 100),
      lineEnding: configuration.get<
        ExtensionSettings["format"]["lineEnding"]
      >("format.lineEnding", "preserve"),
      generatedFiles: configuration.get<
        ExtensionSettings["format"]["generatedFiles"]
      >("format.generatedFiles", "skip"),
    },
  };
}

const statusText: Record<ServerState, string> = {
  starting: "TomlSmith: Starting",
  running: "TomlSmith",
  stopped: "TomlSmith: Stopped",
  failed: "TomlSmith: Failed",
};

function bundledServerPath(extensionPath: string): string | undefined {
  const executable =
    process.platform === "win32" ? "tomlsmith-lsp.exe" : "tomlsmith-lsp";
  const candidate = path.join(
    extensionPath,
    "server",
    `${process.platform}-${process.arch}`,
    executable,
  );
  return existsSync(candidate) ? candidate : undefined;
}

function createHost(
  statusItem: vscode.LanguageStatusItem,
  extensionPath: string,
): ExtensionHost {
  return {
    environment: process.env,
    // A getter so every launch re-checks whether the binary is present.
    get bundledServerPath() {
      return bundledServerPath(extensionPath);
    },
    readSettings,
    onDidChangeConfiguration: (listener) =>
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (!event.affectsConfiguration("tomlsmith")) {
          return undefined;
        }
        return listener({
          affectsServerLaunch: event.affectsConfiguration("tomlsmith.server"),
        }).catch(() => undefined);
      }),
    registerCommand: (command, handler) =>
      vscode.commands.registerCommand(command, () => handler()),
    showError: (message) => {
      void vscode.window.showErrorMessage(message);
    },
    showStartupError: (message) => {
      const openSettings = "Open Settings";
      void vscode.window
        .showErrorMessage(message, openSettings)
        .then((selection) => {
          if (selection === openSettings) {
            return vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "tomlsmith.server.path",
            );
          }
          return undefined;
        });
    },
    updateStatus: (status) => {
      statusItem.busy = status.state === "starting";
      statusItem.severity =
        status.state === "failed"
          ? vscode.LanguageStatusSeverity.Error
          : vscode.LanguageStatusSeverity.Information;
      statusItem.text = statusText[status.state];
      statusItem.detail = status.state === "failed" ? status.detail ?? "" : "";
    },
  };
}

function mapClientState(state: State): ClientState {
  switch (state) {
    case State.Starting:
      return "starting";
    case State.Running:
      return "running";
    default:
      return "stopped";
  }
}

const clientFactory: ClientFactory = {
  create(plan) {
    const serverOptions: ServerOptions = {
      command: plan.server.command,
      args: [...plan.server.arguments],
      options: {
        env: { ...plan.server.environment },
      },
    };
    const clientOptions: LanguageClientOptions = {
      documentSelector: [...plan.documents],
      // The library resolves a thunk on every initialize handshake, so a
      // server it auto-restarts after a crash receives the current settings
      // instead of the ones captured when the client was created.
      initializationOptions: () => {
        const options = plan.initializationOptions();
        return {
          tomlVersion: options.tomlVersion,
          format: { ...options.format },
        };
      },
    };
    const client = new NodeLanguageClient(
      plan.id,
      plan.name,
      serverOptions,
      clientOptions,
    );
    return {
      start: () => client.start(),
      stop: () => client.stop(),
      sendNotification: (method, params) =>
        client.sendNotification(method, params),
      onDidChangeState: (listener) =>
        client.onDidChangeState((event) =>
          listener(mapClientState(event.newState)),
        ),
    };
  },
};

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const statusItem = vscode.languages.createLanguageStatusItem(
    "tomlsmith.status",
    { language: "toml" },
  );
  statusItem.name = "TomlSmith";
  statusItem.command = {
    title: "Restart Server",
    command: "tomlsmith.restartServer",
  };
  context.subscriptions.push(statusItem);

  const host = createHost(statusItem, context.extensionPath);
  try {
    running = await startExtension(host, clientFactory);
    context.subscriptions.push(running);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.showError(`TomlSmith failed to start: ${message}`);
    throw error;
  }
}

export async function deactivate(): Promise<void> {
  const active = running;
  running = undefined;
  active?.dispose();
  await active?.stop();
}
