import { constants } from "node:fs";
import { access, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import * as vscode from "vscode";

interface E2eDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning" | "information" | "hint";
  source: string;
}

interface E2eReport {
  diagnostics: E2eDiagnostic[];
  extensionActive: boolean;
  extensionId: string;
  extensionPath: string;
  extensionVersion: string;
  formattedText: string;
  languageId: string;
  serverMode: "bundled" | "external";
  serverPath: string;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} is required by the VS Code e2e runner`);
  }
  return value;
}

function diagnosticCode(diagnostic: vscode.Diagnostic): string {
  const { code } = diagnostic;
  if (typeof code === "object" && code !== null) {
    return String(code.value);
  }
  return String(code);
}

function diagnosticSeverity(
  severity: vscode.DiagnosticSeverity,
): E2eDiagnostic["severity"] {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "information";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

function isInside(parent: string, child: string): boolean {
  const pathFromParent = relative(resolve(parent), resolve(child));
  return (
    pathFromParent !== "" &&
    pathFromParent !== ".." &&
    !pathFromParent.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromParent)
  );
}

async function waitForDiagnostic(
  uri: vscode.Uri,
  expectedCode: string,
): Promise<readonly vscode.Diagnostic[]> {
  const current = (): readonly vscode.Diagnostic[] =>
    vscode.languages.getDiagnostics(uri);
  const hasExpectedDiagnostic = (
    diagnostics: readonly vscode.Diagnostic[],
  ): boolean => diagnostics.some((diagnostic) => diagnosticCode(diagnostic) === expectedCode);

  const initial = current();
  if (hasExpectedDiagnostic(initial)) {
    return initial;
  }

  return new Promise((resolveDiagnostics, rejectDiagnostics) => {
    const listener = vscode.languages.onDidChangeDiagnostics((event) => {
      if (!event.uris.some((changed) => changed.toString() === uri.toString())) {
        return;
      }
      const diagnostics = current();
      if (!hasExpectedDiagnostic(diagnostics)) {
        return;
      }
      clearTimeout(timeout);
      listener.dispose();
      resolveDiagnostics(diagnostics);
    });
    const timeout = setTimeout(() => {
      listener.dispose();
      rejectDiagnostics(
        new Error(
          `timed out waiting for ${expectedCode}; received ${JSON.stringify(current().map(diagnosticCode))}`,
        ),
      );
    }, 20_000);
    const afterSubscription = current();
    if (hasExpectedDiagnostic(afterSubscription)) {
      clearTimeout(timeout);
      listener.dispose();
      resolveDiagnostics(afterSubscription);
    }
  });
}

export async function run(): Promise<void> {
  const expectedExtensionsDirectory = requiredEnvironment(
    "TOMLSMITH_E2E_EXTENSIONS_DIR",
  );
  const expectedExtensionId = requiredEnvironment("TOMLSMITH_E2E_EXTENSION_ID");
  const reportPath = requiredEnvironment("TOMLSMITH_E2E_REPORT");
  const serverMode = requiredEnvironment("TOMLSMITH_E2E_SERVER_MODE");
  if (serverMode !== "bundled" && serverMode !== "external") {
    throw new Error(`unsupported TOMLSMITH_E2E_SERVER_MODE: ${serverMode}`);
  }
  const workspacePath = requiredEnvironment("TOMLSMITH_E2E_WORKSPACE");
  const extension = vscode.extensions.getExtension(expectedExtensionId);
  if (extension === undefined) {
    throw new Error(`the packaged ${expectedExtensionId} extension is not installed`);
  }

  const installedExtensionPath = await realpath(extension.extensionPath);
  const installedExtensionsDirectory = await realpath(expectedExtensionsDirectory);
  if (!isInside(installedExtensionsDirectory, installedExtensionPath)) {
    throw new Error(
      `TomlSmith loaded from ${installedExtensionPath}, outside the isolated VSIX installation at ${installedExtensionsDirectory}`,
    );
  }

  const executable = process.platform === "win32" ? "tomlsmith-lsp.exe" : "tomlsmith-lsp";
  const bundledServerPath = join(
    installedExtensionPath,
    "server",
    `${process.platform}-${process.arch}`,
    executable,
  );
  let serverPath: string;
  if (serverMode === "bundled") {
    await access(bundledServerPath, constants.X_OK);
    serverPath = bundledServerPath;
  } else {
    if (await pathExists(bundledServerPath)) {
      throw new Error(
        `the universal VSIX unexpectedly contains a bundled server at ${bundledServerPath}`,
      );
    }
    serverPath = resolve(requiredEnvironment("TOMLSMITH_E2E_EXTERNAL_SERVER"));
    await access(serverPath, constants.X_OK);
    const configuredServerPath = vscode.workspace
      .getConfiguration("tomlsmith")
      .get<string>("server.path");
    if (configuredServerPath !== serverPath) {
      throw new Error(
        `expected tomlsmith.server.path to be ${serverPath}, received ${String(configuredServerPath)}`,
      );
    }
  }

  await extension.activate();
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(workspacePath, "broken.toml")),
  );
  await vscode.window.showTextDocument(document);
  const diagnostics = await waitForDiagnostic(
    document.uri,
    "parse.missing-equals",
  );
  const formattingDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(workspacePath, "format.toml")),
  );
  const edits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    "vscode.executeFormatDocumentProvider",
    formattingDocument.uri,
    { insertSpaces: true, tabSize: 2 },
  );
  if (edits === undefined || edits.length === 0) {
    throw new Error("the installed extension returned no formatting edits");
  }
  const formattingEdit = new vscode.WorkspaceEdit();
  formattingEdit.set(formattingDocument.uri, edits);
  if (!(await vscode.workspace.applyEdit(formattingEdit))) {
    throw new Error("VS Code rejected the formatting edits returned by TomlSmith");
  }

  const report: E2eReport = {
    diagnostics: diagnostics.map((diagnostic) => ({
      code: diagnosticCode(diagnostic),
      message: diagnostic.message,
      severity: diagnosticSeverity(diagnostic.severity),
      source: diagnostic.source ?? "",
    })),
    extensionActive: extension.isActive,
    extensionId: extension.id,
    extensionPath: installedExtensionPath,
    extensionVersion: String(extension.packageJSON.version),
    formattedText: formattingDocument.getText(),
    languageId: document.languageId,
    serverMode,
    serverPath,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
