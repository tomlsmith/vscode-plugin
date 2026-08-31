import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, expect, test } from "vitest";

import { activate, deactivate } from "../src/extension";
import {
  clients,
  resetLanguageClients,
  State,
} from "./support/languageclient";
import {
  fireConfigurationChange,
  languageStatusItems,
  LanguageStatusSeverity,
  resetVscode,
  setConfiguration,
  setConfigurationInspection,
  setWorkspaceTrust,
  workspace,
} from "./support/vscode";

const temporaryDirectories: string[] = [];

// Creates a fake extension install directory containing a bundled server
// binary for the platform the test process runs on.
function stageBundledServer(): { extensionPath: string; binary: string } {
  const extensionPath = mkdtempSync(path.join(tmpdir(), "tomlsmith-vscode-"));
  temporaryDirectories.push(extensionPath);
  const binary = path.join(
    extensionPath,
    "server",
    `${process.platform}-${process.arch}`,
    process.platform === "win32" ? "tomlsmith-lsp.exe" : "tomlsmith-lsp",
  );
  mkdirSync(path.dirname(binary), { recursive: true });
  writeFileSync(binary, "");
  return { extensionPath, binary };
}

beforeEach(() => {
  resetVscode();
  resetLanguageClients();
});

// Resolves the initialization-options thunk the way the language client
// library does on every initialize handshake.
function resolveInitializationOptions(
  client: (typeof clients)[number] | undefined,
): unknown {
  const options = client?.clientOptions as {
    initializationOptions: () => unknown;
  };
  return options.initializationOptions();
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the VS Code adapter launches and shuts down the configured language server", async () => {
  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp",
    "server.arguments": ["--stdio"],
    "server.environment": { RUST_LOG: "info" },
    "toml.version": "1.1",
    "format.indentWidth": 4,
    "format.lineWidth": 120,
    "format.lineEnding": "crlf",
    "format.generatedFiles": "format",
  });
  const subscriptions: Array<{ dispose(): void }> = [];

  await activate({
    extensionPath: "/extensions/tomlsmith",
    subscriptions,
  } as Parameters<typeof activate>[0]);

  expect(workspace.getConfiguration).toHaveBeenCalledWith("tomlsmith");
  expect(clients).toHaveLength(1);
  expect(clients[0]).toMatchObject({
    id: "tomlsmith",
    name: "TomlSmith",
    serverOptions: {
      command: "/tools/tomlsmith-lsp",
      args: ["--stdio"],
      options: {
        env: expect.objectContaining({ RUST_LOG: "info" }),
      },
    },
    clientOptions: {
      documentSelector: [
        { language: "toml", scheme: "file" },
        { language: "toml", scheme: "untitled" },
      ],
      initializationOptions: expect.any(Function),
    },
  });
  expect(resolveInitializationOptions(clients[0])).toEqual({
    tomlVersion: "1.1",
    format: {
      indentWidth: 4,
      lineWidth: 120,
      lineEnding: "crlf",
      generatedFiles: "format",
    },
  });
  expect(clients[0]?.start).toHaveBeenCalledOnce();
  expect(subscriptions).toHaveLength(2);

  await deactivate();

  expect(clients[0]?.stop).toHaveBeenCalledOnce();
});

test("the VS Code adapter applies the contract defaults when no settings are configured", async () => {
  setConfiguration({});

  await activate({
    extensionPath: "/extensions/tomlsmith",
    subscriptions: [],
  } as unknown as Parameters<typeof activate>[0]);

  const options = resolveInitializationOptions(clients[0]) as {
    tomlVersion: string;
    format: Record<string, unknown>;
  };
  expect(options.tomlVersion).toBe("1.1");
  expect("indentWidth" in options.format).toBe(false);
  expect(options.format).toEqual({
    lineWidth: 100,
    lineEnding: "preserve",
    generatedFiles: "skip",
  });

  await deactivate();
});

test("server launch configuration changes restart the client with fresh settings", async () => {
  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp-v1",
    "server.arguments": ["--old"],
    "server.environment": { GENERATION: "one" },
    "toml.version": "1.1",
    "format.indentWidth": 2,
    "format.lineWidth": 100,
    "format.lineEnding": "preserve",
    "format.generatedFiles": "skip",
  });
  const subscriptions: Array<{ dispose(): void }> = [];

  await activate({
    extensionPath: "/extensions/tomlsmith",
    subscriptions,
  } as Parameters<typeof activate>[0]);

  await fireConfigurationChange(["editor.fontSize"]);
  expect(clients).toHaveLength(1);

  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp-v2",
    "server.arguments": ["--new"],
    "server.environment": { GENERATION: "two" },
    "toml.version": "1.0",
    "format.indentWidth": 4,
    "format.lineWidth": 120,
    "format.lineEnding": "crlf",
    "format.generatedFiles": "format",
  });
  await fireConfigurationChange(["tomlsmith.server.path"]);

  expect(clients).toHaveLength(2);
  expect(clients[0]?.stop).toHaveBeenCalledOnce();
  expect(clients[1]).toMatchObject({
    serverOptions: {
      command: "/tools/tomlsmith-lsp-v2",
      args: ["--new"],
      options: {
        env: expect.objectContaining({ GENERATION: "two" }),
      },
    },
  });
  expect(resolveInitializationOptions(clients[1])).toEqual({
    tomlVersion: "1.0",
    format: {
      indentWidth: 4,
      lineWidth: 120,
      lineEnding: "crlf",
      generatedFiles: "format",
    },
  });

  await deactivate();
  expect(clients[1]?.stop).toHaveBeenCalledOnce();
});

test("language configuration changes push workspace/didChangeConfiguration without a restart", async () => {
  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp",
    "toml.version": "1.0",
    "format.indentWidth": null,
    "format.lineWidth": 100,
    "format.lineEnding": "preserve",
    "format.generatedFiles": "skip",
  });

  await activate({
    extensionPath: "/extensions/tomlsmith",
    subscriptions: [],
  } as unknown as Parameters<typeof activate>[0]);

  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp",
    "toml.version": "1.1",
    "format.indentWidth": 3,
    "format.lineWidth": 80,
    "format.lineEnding": "lf",
    "format.generatedFiles": "format",
  });
  await fireConfigurationChange(["tomlsmith.toml.version"]);

  expect(clients).toHaveLength(1);
  expect(clients[0]?.stop).not.toHaveBeenCalled();
  expect(clients[0]?.sendNotification).toHaveBeenCalledWith(
    "workspace/didChangeConfiguration",
    {
      settings: {
        tomlVersion: "1.1",
        format: {
          indentWidth: 3,
          lineWidth: 80,
          lineEnding: "lf",
          generatedFiles: "format",
        },
      },
    },
  );

  await deactivate();
});

test("an auto-restarted server receives settings pushed after client creation", async () => {
  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp",
    "toml.version": "1.0",
  });

  await activate({
    extensionPath: "/extensions/tomlsmith",
    subscriptions: [],
  } as unknown as Parameters<typeof activate>[0]);

  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp",
    "toml.version": "1.1",
  });
  await fireConfigurationChange(["tomlsmith.toml.version"]);

  expect(clients).toHaveLength(1);
  // vscode-languageclient re-resolves the initialization-options thunk when
  // it re-runs the initialize handshake after an automatic crash restart,
  // so the restarted server must see the pushed settings, not the ones
  // captured when the client was created.
  expect(resolveInitializationOptions(clients[0])).toMatchObject({
    tomlVersion: "1.1",
  });

  await deactivate();
});

test("the VS Code adapter launches a bundled server when the path setting keeps its default", async () => {
  const { extensionPath, binary } = stageBundledServer();
  setConfiguration({});

  await activate({
    extensionPath,
    subscriptions: [],
  } as unknown as Parameters<typeof activate>[0]);

  expect(clients[0]?.serverOptions).toMatchObject({ command: binary });

  await deactivate();
});

test("an explicitly configured server path overrides the bundled server", async () => {
  const { extensionPath } = stageBundledServer();
  setConfiguration({ "server.path": "/custom/tomlsmith-lsp" });
  setConfigurationInspection("server.path", {
    globalValue: "/custom/tomlsmith-lsp",
  });

  await activate({
    extensionPath,
    subscriptions: [],
  } as unknown as Parameters<typeof activate>[0]);

  expect(clients[0]?.serverOptions).toMatchObject({
    command: "/custom/tomlsmith-lsp",
  });

  await deactivate();
});

test("Restricted Mode keeps the bundled server when only workspace scopes set the path", async () => {
  const { extensionPath, binary } = stageBundledServer();
  setWorkspaceTrust(false);
  // In an untrusted workspace get() filters this restricted setting back to
  // its default, but inspect() still reveals the workspace value; counting
  // it as explicit would abandon the bundled server for a value that is
  // never used.
  setConfiguration({});
  setConfigurationInspection("server.path", {
    workspaceValue: "/repo/.vscode/tomlsmith-lsp",
    workspaceFolderValue: "/repo/.vscode/tomlsmith-lsp",
  });

  await activate({
    extensionPath,
    subscriptions: [],
  } as unknown as Parameters<typeof activate>[0]);

  expect(clients[0]?.serverOptions).toMatchObject({ command: binary });

  await deactivate();
});

test("the language status item tracks the server lifecycle and offers a restart", async () => {
  setConfiguration({
    "server.path": "/tools/tomlsmith-lsp",
  });
  const subscriptions: Array<{ dispose(): void }> = [];

  await activate({
    extensionPath: "/extensions/tomlsmith",
    subscriptions,
  } as Parameters<typeof activate>[0]);

  expect(languageStatusItems).toHaveLength(1);
  const item = languageStatusItems[0];
  expect(item).toMatchObject({
    id: "tomlsmith.status",
    selector: { language: "toml" },
    name: "TomlSmith",
    command: {
      title: "Restart Server",
      command: "tomlsmith.restartServer",
    },
    text: "TomlSmith",
    busy: false,
    severity: LanguageStatusSeverity.Information,
  });

  clients[0]?.fireStateChange(State.Stopped);
  expect(item?.text).toBe("TomlSmith: Stopped");

  clients[0]?.fireStateChange(State.Running);
  expect(item?.text).toBe("TomlSmith");

  await deactivate();
});
