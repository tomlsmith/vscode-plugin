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

interface E2eFoldingRange {
  end: number;
  kind: "comment" | "imports" | "region" | null;
  start: number;
}

interface E2ePosition {
  character: number;
  line: number;
}

interface E2eDocumentSymbol {
  children: E2eDocumentSymbol[];
  kind: "array" | "namespace" | "property" | "other";
  name: string;
  selectionEnd: E2ePosition;
  selectionStart: E2ePosition;
}

interface E2eSemanticTokenLegend {
  tokenModifiers: string[];
  tokenTypes: string[];
}

interface E2eReport {
  declaredSemanticTokenModifiers: string[];
  defaultVersionFormattedText: string;
  diagnostics: E2eDiagnostic[];
  documentSymbols: E2eDocumentSymbol[];
  extensionActive: boolean;
  extensionId: string;
  extensionPath: string;
  extensionVersion: string;
  foldingRanges: E2eFoldingRange[];
  formattedText: string;
  hoverText: string;
  inlineTableMemberDarkPlusColor: string | null;
  inlineTableMemberDarkPlusTextMateColor: string | null;
  languageId: string;
  navigationTarget: E2ePosition;
  semanticTokenData: number[];
  semanticTokenLegend: E2eSemanticTokenLegend;
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

function foldingRangeKind(
  kind: vscode.FoldingRangeKind | undefined,
): E2eFoldingRange["kind"] {
  switch (kind) {
    case vscode.FoldingRangeKind.Comment:
      return "comment";
    case vscode.FoldingRangeKind.Imports:
      return "imports";
    case vscode.FoldingRangeKind.Region:
      return "region";
    default:
      return null;
  }
}

function symbolKind(kind: vscode.SymbolKind): E2eDocumentSymbol["kind"] {
  switch (kind) {
    case vscode.SymbolKind.Array:
      return "array";
    case vscode.SymbolKind.Namespace:
      return "namespace";
    case vscode.SymbolKind.Property:
      return "property";
    default:
      return "other";
  }
}

function position(position: vscode.Position): E2ePosition {
  return { character: position.character, line: position.line };
}

function isDocumentSymbol(
  symbol: vscode.DocumentSymbol | vscode.SymbolInformation,
): symbol is vscode.DocumentSymbol {
  return "selectionRange" in symbol;
}

function documentSymbol(symbol: vscode.DocumentSymbol): E2eDocumentSymbol {
  return {
    children: symbol.children.map(documentSymbol),
    kind: symbolKind(symbol.kind),
    name: symbol.name,
    selectionEnd: position(symbol.selectionRange.end),
    selectionStart: position(symbol.selectionRange.start),
  };
}

function objectProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || !(key in value)) {
    return undefined;
  }
  return value[key as keyof typeof value];
}

function semanticTokenColor(
  customizations: unknown,
  themeSelector: string,
  tokenSelector: string,
): string | null {
  const rules = objectProperty(
    objectProperty(customizations, themeSelector),
    "rules",
  );
  const color = objectProperty(rules, tokenSelector);
  if (typeof color === "string") {
    return color;
  }
  const foreground = objectProperty(color, "foreground");
  return typeof foreground === "string" ? foreground : null;
}

function textMateScopeColor(
  customizations: unknown,
  themeSelector: string,
  expectedScope: string,
): string | null {
  const rules = objectProperty(
    objectProperty(customizations, themeSelector),
    "textMateRules",
  );
  if (!Array.isArray(rules)) {
    return null;
  }
  for (const rule of rules) {
    const scope = objectProperty(rule, "scope");
    const matches =
      scope === expectedScope ||
      (Array.isArray(scope) && scope.includes(expectedScope));
    if (!matches) {
      continue;
    }
    const foreground = objectProperty(
      objectProperty(rule, "settings"),
      "foreground",
    );
    if (typeof foreground === "string") {
      return foreground;
    }
  }
  return null;
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
  const semanticTokenModifierContributions: unknown =
    extension.packageJSON.contributes?.semanticTokenModifiers;
  if (!Array.isArray(semanticTokenModifierContributions)) {
    throw new Error("the installed extension declares no semantic token modifiers");
  }
  const declaredSemanticTokenModifiers = semanticTokenModifierContributions.map(
    (contribution: unknown) => {
      if (
        typeof contribution !== "object" ||
        contribution === null ||
        !("id" in contribution) ||
        typeof contribution.id !== "string"
      ) {
        throw new Error("the installed extension has a malformed semantic token modifier");
      }
      return contribution.id;
    },
  );

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
  const versionDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(workspacePath, "version.toml")),
  );
  const versionEdits = await vscode.commands.executeCommand<vscode.TextEdit[]>(
    "vscode.executeFormatDocumentProvider",
    versionDocument.uri,
    { insertSpaces: true, tabSize: 2 },
  );
  if (versionEdits === undefined || versionEdits.length === 0) {
    throw new Error(
      "the installed extension did not format TOML 1.1-only syntax by default",
    );
  }
  const versionEdit = new vscode.WorkspaceEdit();
  versionEdit.set(versionDocument.uri, versionEdits);
  if (!(await vscode.workspace.applyEdit(versionEdit))) {
    throw new Error("VS Code rejected the TOML 1.1 default formatting edits");
  }
  const structureDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(workspacePath, "structure.toml")),
  );
  const highlightDocument = await vscode.workspace.openTextDocument(
    vscode.Uri.file(join(workspacePath, "highlight.toml")),
  );
  const semanticTokenColorCustomizations = vscode.workspace
    .getConfiguration("editor", highlightDocument)
    .get<unknown>("semanticTokenColorCustomizations");
  const tokenColorCustomizations = vscode.workspace
    .getConfiguration("editor", highlightDocument)
    .get<unknown>("tokenColorCustomizations");
  const semanticTokenLegend = await vscode.commands.executeCommand<
    vscode.SemanticTokensLegend
  >("vscode.provideDocumentSemanticTokensLegend", highlightDocument.uri);
  if (semanticTokenLegend === undefined) {
    throw new Error("the installed extension returned no TOML semantic token legend");
  }
  const semanticTokens = await vscode.commands.executeCommand<vscode.SemanticTokens>(
    "vscode.provideDocumentSemanticTokens",
    highlightDocument.uri,
  );
  if (semanticTokens === undefined || semanticTokens.data.length === 0) {
    throw new Error("the installed extension returned no TOML semantic tokens");
  }
  const foldingRanges = await vscode.commands.executeCommand<
    vscode.FoldingRange[]
  >("vscode.executeFoldingRangeProvider", structureDocument.uri);
  if (foldingRanges === undefined || foldingRanges.length === 0) {
    throw new Error("the installed extension returned no TOML folding ranges");
  }
  const symbols = await vscode.commands.executeCommand<
    Array<vscode.DocumentSymbol | vscode.SymbolInformation>
  >("vscode.executeDocumentSymbolProvider", structureDocument.uri);
  if (symbols === undefined || symbols.length === 0) {
    throw new Error("the installed extension returned no TOML document symbols");
  }
  if (!symbols.every(isDocumentSymbol)) {
    throw new Error("VS Code did not receive hierarchical TOML document symbols");
  }
  const serverSymbol = symbols.find((symbol) => symbol.name === "server");
  const tlsSymbol = serverSymbol?.children.find(
    (symbol) => symbol.name === "tls",
  );
  if (tlsSymbol === undefined) {
    throw new Error("the TOML symbol tree did not contain server.tls");
  }
  const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    structureDocument.uri,
    new vscode.Position(7, 2),
  );
  if (hovers === undefined || hovers.length === 0) {
    throw new Error("the installed extension returned no TOML hover information");
  }
  const hoverText = hovers
    .flatMap((hover) => hover.contents)
    .map((content) => (typeof content === "string" ? content : content.value))
    .join("\n");
  if (hoverText === "") {
    throw new Error("the installed extension returned an empty TOML hover");
  }
  const navigationEditor = await vscode.window.showTextDocument(
    structureDocument,
    { selection: tlsSymbol.selectionRange },
  );

  const report: E2eReport = {
    declaredSemanticTokenModifiers,
    defaultVersionFormattedText: versionDocument.getText(),
    diagnostics: diagnostics.map((diagnostic) => ({
      code: diagnosticCode(diagnostic),
      message: diagnostic.message,
      severity: diagnosticSeverity(diagnostic.severity),
      source: diagnostic.source ?? "",
    })),
    documentSymbols: symbols.map(documentSymbol),
    extensionActive: extension.isActive,
    extensionId: extension.id,
    extensionPath: installedExtensionPath,
    extensionVersion: String(extension.packageJSON.version),
    foldingRanges: foldingRanges.map((range) => ({
      end: range.end,
      kind: foldingRangeKind(range.kind),
      start: range.start,
    })),
    formattedText: formattingDocument.getText(),
    hoverText,
    inlineTableMemberDarkPlusColor: semanticTokenColor(
      semanticTokenColorCustomizations,
      "[Dark+][Default Dark+]",
      "property.tomlInlineTableMember:toml",
    ),
    inlineTableMemberDarkPlusTextMateColor: textMateScopeColor(
      tokenColorCustomizations,
      "[Dark+][Default Dark+]",
      "variable.other.property.inline-table-member.toml",
    ),
    languageId: document.languageId,
    navigationTarget: position(navigationEditor.selection.start),
    semanticTokenData: Array.from(semanticTokens.data),
    semanticTokenLegend: {
      tokenModifiers: [...semanticTokenLegend.tokenModifiers],
      tokenTypes: [...semanticTokenLegend.tokenTypes],
    },
    serverMode,
    serverPath,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
