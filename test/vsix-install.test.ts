import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";
import { build } from "esbuild";
import { expect, test } from "vitest";

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

const vsixFromEnvironment = process.env.TOMLSMITH_VSIX_E2E;
const externalServerFromEnvironment =
  process.env.TOMLSMITH_VSIX_EXTERNAL_SERVER;
const expectSemanticModifiers =
  process.env.TOMLSMITH_VSIX_EXPECT_SEMANTIC_MODIFIERS === "true";
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function assertNoPathServer(): void {
  const executable = process.platform === "win32" ? "tomlsmith-lsp.exe" : "tomlsmith-lsp";
  const pathServer = (process.env.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry !== "")
    .map((entry) => join(entry, executable))
    .find(existsSync);
  expect(
    pathServer,
    "the e2e environment must not contain a PATH server; diagnostics must come from the selected test server",
  ).toBeUndefined();
}

async function resolveVSCodeExecutable(): Promise<string> {
  const configuredExecutable = process.env.TOMLSMITH_VSCODE_EXECUTABLE;
  if (configuredExecutable !== undefined && configuredExecutable !== "") {
    return configuredExecutable;
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await downloadAndUnzipVSCode({
        cachePath: join(repositoryRoot, ".vscode-test"),
        version: process.env.TOMLSMITH_VSCODE_VERSION ?? "1.95.0",
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 2_000),
        );
      }
    }
  }
  throw new Error("unable to download VS Code after three attempts", {
    cause: lastError,
  });
}

test.skipIf(vsixFromEnvironment === undefined)(
  "an isolated VS Code installs the VSIX and exercises its selected language server",
  async () => {
    if (vsixFromEnvironment === undefined) {
      throw new Error("TOMLSMITH_VSIX_E2E is required for this test");
    }
    assertNoPathServer();
    const vsixPath = resolve(vsixFromEnvironment);
    expect(existsSync(vsixPath), `${vsixPath} must exist`).toBe(true);
    const externalServerPath = externalServerFromEnvironment
      ? resolve(externalServerFromEnvironment)
      : undefined;
    if (externalServerPath !== undefined) {
      expect(
        existsSync(externalServerPath),
        `${externalServerPath} must exist`,
      ).toBe(true);
    }
    const serverMode = externalServerPath === undefined ? "bundled" : "external";
    const manifest = JSON.parse(
      await readFile(join(repositoryRoot, "package.json"), "utf8"),
    ) as { name: string; publisher: string; version: string };
    const expectedExtensionId = `${manifest.publisher}.${manifest.name}`;

    const temporaryRoot = await mkdtemp(join(tmpdir(), "tomlsmith-vscode-e2e-"));
    try {
      const extensionsDirectory = join(temporaryRoot, "extensions");
      const userDataDirectory = join(temporaryRoot, "user-data");
      const workspaceDirectory = join(temporaryRoot, "workspace");
      const driverDirectory = join(temporaryRoot, "driver-extension");
      const runnerPath = join(driverDirectory, "runner.cjs");
      const reportPath = join(temporaryRoot, "report.json");
      await Promise.all([
        mkdir(extensionsDirectory, { recursive: true }),
        mkdir(userDataDirectory, { recursive: true }),
        mkdir(join(userDataDirectory, "User"), { recursive: true }),
        mkdir(workspaceDirectory, { recursive: true }),
        mkdir(driverDirectory, { recursive: true }),
      ]);
      await Promise.all([
        writeFile(join(workspaceDirectory, "broken.toml"), "broken\n", "utf8"),
        writeFile(
          join(workspaceDirectory, "format.toml"),
          "values=[\n1,\n]\n",
          "utf8",
        ),
        writeFile(
          join(workspaceDirectory, "version.toml"),
          'escape="\\e"\n',
          "utf8",
        ),
        writeFile(
          join(workspaceDirectory, "structure.toml"),
          '[server]\nports = [\n  8000,\n  8001,\n]\n\n[server.tls]\nenabled = true\n',
          "utf8",
        ),
        writeFile(
          join(workspaceDirectory, "highlight.toml"),
          'scalar = 1\narray = []\ninline = { version = "0.8.2" }\n\n[table]\nvalue = true\n\n[[array_table]]\nname = "one"\n',
          "utf8",
        ),
        writeFile(
          join(userDataDirectory, "User", "settings.json"),
          `${JSON.stringify(
            {
              "workbench.colorTheme": "Default Dark+",
              ...(externalServerPath === undefined
                ? {}
                : { "tomlsmith.server.path": externalServerPath }),
            },
            null,
            2,
          )}\n`,
          "utf8",
        ),
        writeFile(
          join(driverDirectory, "package.json"),
          `${JSON.stringify(
            {
              name: "tomlsmith-vsix-e2e-driver",
              publisher: "tomlsmith-tests",
              version: "0.0.0",
              engines: { vscode: "^1.95.0" },
              main: "./noop.cjs",
            },
            null,
            2,
          )}\n`,
          "utf8",
        ),
        writeFile(
          join(driverDirectory, "noop.cjs"),
          "exports.activate = function activate() {};\n",
          "utf8",
        ),
      ]);
      await build({
        entryPoints: [
          join(repositoryRoot, "test", "support", "vscode-e2e-runner.ts"),
        ],
        bundle: true,
        external: ["vscode"],
        format: "cjs",
        logLevel: "silent",
        outfile: runnerPath,
        platform: "node",
        target: "node20",
      });

      const vscodeExecutablePath = await resolveVSCodeExecutable();
      const [cliPath, ...cliPrefixArguments] =
        resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath, {
          reuseMachineInstall: true,
        });
      if (cliPath === undefined) {
        throw new Error("unable to resolve the VS Code command-line executable");
      }
      const profileArguments = [
        `--extensions-dir=${extensionsDirectory}`,
        `--user-data-dir=${userDataDirectory}`,
      ];
      const install = spawnSync(
        cliPath,
        [
          ...cliPrefixArguments,
          ...profileArguments,
          "--install-extension",
          vsixPath,
          "--force",
        ],
        {
          encoding: "utf8",
          shell: process.platform === "win32",
        },
      );
      expect(install.error).toBeUndefined();
      expect(
        install.status,
        `VSIX installation failed:\n${install.stdout}\n${install.stderr}`,
      ).toBe(0);

      const installed = spawnSync(
        cliPath,
        [
          ...cliPrefixArguments,
          ...profileArguments,
          "--list-extensions",
          "--show-versions",
        ],
        {
          encoding: "utf8",
          shell: process.platform === "win32",
        },
      );
      expect(installed.error).toBeUndefined();
      expect(installed.status, installed.stderr).toBe(0);
      expect(installed.stdout.split(/\r?\n/)).toContain(
        `${expectedExtensionId.toLowerCase()}@${manifest.version}`,
      );

      const exitCode = await runTests({
        extensionDevelopmentPath: driverDirectory,
        extensionTestsPath: runnerPath,
        extensionTestsEnv: {
          TOMLSMITH_E2E_EXTENSIONS_DIR: extensionsDirectory,
          TOMLSMITH_E2E_EXTENSION_ID: expectedExtensionId,
          TOMLSMITH_E2E_EXTERNAL_SERVER: externalServerPath ?? "",
          TOMLSMITH_E2E_REPORT: reportPath,
          TOMLSMITH_E2E_SERVER_MODE: serverMode,
          TOMLSMITH_E2E_WORKSPACE: workspaceDirectory,
        },
        launchArgs: [workspaceDirectory, ...profileArguments, "--new-window"],
        vscodeExecutablePath,
      });
      expect(exitCode).toBe(0);

      const report = JSON.parse(
        await readFile(reportPath, "utf8"),
      ) as E2eReport;
      expect(report).toMatchObject({
        extensionActive: true,
        extensionId: expectedExtensionId,
        extensionVersion: manifest.version,
        languageId: "toml",
      });
      const parseDiagnostic = report.diagnostics.find(
        (diagnostic) => diagnostic.code === "parse.missing-equals",
      );
      expect(parseDiagnostic).toMatchObject({
        code: "parse.missing-equals",
        severity: "error",
        source: "tomlsmith",
      });
      expect(parseDiagnostic?.message.trim()).not.toBe("");
      expect(report.defaultVersionFormattedText).toBe('escape = "\\e"\n');
      expect(report.formattedText).toBe("values = [\n  1,\n]\n");
      expect(report.foldingRanges).toEqual(
        expect.arrayContaining([
          { end: 7, kind: "region", start: 0 },
          { end: 4, kind: "region", start: 1 },
          { end: 7, kind: "region", start: 6 },
        ]),
      );
      expect(report.documentSymbols).toEqual([
        expect.objectContaining({
          children: expect.arrayContaining([
            expect.objectContaining({
              kind: "property",
              name: "ports",
            }),
            expect.objectContaining({
              children: [
                expect.objectContaining({
                  kind: "property",
                  name: "enabled",
                }),
              ],
              kind: "namespace",
              name: "tls",
              selectionEnd: expect.objectContaining({ line: 6 }),
              selectionStart: expect.objectContaining({ line: 6 }),
            }),
          ]),
          kind: "namespace",
          name: "server",
          selectionEnd: expect.objectContaining({ line: 0 }),
          selectionStart: expect.objectContaining({ line: 0 }),
        }),
      ]);
      expect(report.navigationTarget).toEqual(
        expect.objectContaining({ line: 6 }),
      );
      expect(report.hoverText).toContain("server.tls.enabled");
      expect(report.hoverText).toContain("TOML");
      expect(report.hoverText).toContain("boolean");
      expect(report.inlineTableMemberDarkPlusColor).toBe("#4FC1FF");
      expect(report.inlineTableMemberDarkPlusTextMateColor).toBe("#4FC1FF");
      expect(report.declaredSemanticTokenModifiers).toEqual([
        "tomlArray",
        "tomlInlineTable",
        "tomlArrayTable",
        "tomlInlineTableMember",
      ]);
      expect(report.semanticTokenLegend.tokenTypes).toEqual([
        "property",
        "namespace",
        "string",
        "number",
        "keyword",
        "comment",
        "operator",
        "tomlDateTime",
        "tomlInvalid",
      ]);
      expect(report.semanticTokenData.length).toBeGreaterThan(0);
      expect(report.semanticTokenData.length % 5).toBe(0);
      if (expectSemanticModifiers) {
        expect(report.semanticTokenLegend.tokenModifiers).toEqual([
          "tomlArray",
          "tomlInlineTable",
          "tomlArrayTable",
          "tomlInlineTableMember",
        ]);
        expect(
          report.semanticTokenData.filter((_, index) => index % 5 === 4),
        ).toEqual(expect.arrayContaining([1, 2, 4, 8]));
      }
      expect(report.extensionPath).toContain(
        await realpath(extensionsDirectory),
      );
      expect(report.serverMode).toBe(serverMode);
      if (externalServerPath === undefined) {
        expect(report.serverPath).toContain(
          join("server", `${process.platform}-${process.arch}`),
        );
      } else {
        expect(report.serverPath).toBe(externalServerPath);
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  },
  180_000,
);
