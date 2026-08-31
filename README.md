# TomlSmith for VS Code

**English** | [简体中文](README.zh-Hans.md)

[![CI](https://github.com/tomlsmith/vscode-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/tomlsmith/vscode-plugin/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**TOML diagnostics and formatting in VS Code.**

TomlSmith for VS Code uses [TomlSmith](https://github.com/tomlsmith/tomlsmith) for `.toml` files and named TOML files such as `Cargo.lock` and `Pipfile`. It supports TOML 1.0 and 1.1.

## Features

- View errors and warnings while editing TOML files, with stable diagnostic codes in VS Code's **Problems** panel.
- Format a document with VS Code's **Format Document** action. The extension applies the edits returned by the language server instead of replacing the whole document.
- Highlight keys, values, tables, comments, and literals with TextMate and semantic tokens. Regular tables, arrays of tables, scalar keys, array-valued keys, inline-table-valued keys, and member keys inside inline tables receive distinct classifications.
- View a key's path and TOML value kind on hover.
- Browse a hierarchical symbol tree for tables, arrays of tables, and keys through **Outline**, breadcrumbs, and **Go to Symbol in Editor**, including documents whose tables are declared out of order.
- Fold table regions, arrays of tables, multi-line arrays, and TOML 1.1 multi-line inline tables.
- Validate as TOML 1.1 by default, or select strict TOML 1.0 for files consumed by 1.0-only tools.
- Configure indentation, preferred line width, line endings, and whether generated files are formatted.

The extension does not provide rename refactors, completion, Schema integration, or code actions. Switching from Even Better TOML? See the [migration notes](docs/even-better-toml.md).

## Supported files

The extension registers TOML for `.toml` files and these filenames: `Cargo.lock`, `Pipfile`, `uv.lock`, `poetry.lock`, and `pdm.lock`.

## Syntax colors

TomlSmith keeps keys and table headers on VS Code's standard `property` and `namespace` semantic token types, then adds TOML-specific modifiers for array-valued keys, inline-table-valued keys, member keys inside inline tables, and arrays of tables. Themes therefore retain their normal fallback colors while you can override each TOML structure independently.

With Dark+, TomlSmith gives inline-table member keys a cyan `#4FC1FF` default while outer property keys retain Dark+'s light blue and table headers retain its teal namespace color. The default is scoped to TOML and both the newer `Dark+` and older `Default Dark+` theme IDs; a user or workspace color setting still takes precedence. This example customizes the complete palette:

```json
{
  "editor.semanticTokenColorCustomizations": {
    "[Dark+][Default Dark+]": {
      "enabled": true,
      "rules": {
        "property:toml": "#9CDCFE",
        "property.tomlArray:toml": "#569CD6",
        "property.tomlInlineTable:toml": "#9CDCFE",
        "property.tomlInlineTableMember:toml": "#4FC1FF",
        "property.tomlArray.tomlInlineTableMember:toml": "#4FC1FF",
        "property.tomlInlineTable.tomlInlineTableMember:toml": "#4FC1FF",
        "namespace:toml": "#4EC9B0",
        "namespace.tomlArrayTable:toml": "#569CD6",
        "tomlDateTime:toml": "#DCDCAA",
        "tomlInvalid:toml": {
          "foreground": "#F44747",
          "underline": true
        }
      }
    }
  }
}
```

Remove the `[Dark+][Default Dark+]` wrapper and place `enabled` and `rules` directly under `editor.semanticTokenColorCustomizations` to apply the palette to every theme. Matching TextMate scopes provide the same structural fallback before the language server starts or when semantic highlighting is disabled. Use **Developer: Inspect Editor Tokens and Scopes** to inspect the selector and winning color rule at the cursor.

## Set up the language server

The Marketplace and GitHub Release provide platform-specific packages for macOS x64/arm64, non-Alpine Linux x64/arm64, and Windows x64. Each matching package includes a compatible `tomlsmith-lsp`, so no separate server setup is required. The same applies when VS Code installs the extension on the workspace side of a supported Remote-SSH, WSL, or Dev Container environment.

The Marketplace also provides an untargeted universal fallback for environments not covered above, including Alpine and Windows Arm64. The fallback deliberately contains no executable; install `tomlsmith-lsp` from crates.io and configure it explicitly or make it available on `PATH` as described below.

The extension talks to a `tomlsmith-lsp` executable, resolved in this order:

1. An explicitly configured `tomlsmith.server.path` setting.
2. A server binary bundled inside the extension package, when one is present for the current platform.
3. A `tomlsmith-lsp` found on `PATH`.

For extension development or an unsupported platform, if neither a bundled server binary nor one on `PATH` is available, install the published server crate:

1. Install the latest stable server from crates.io:

   ```bash
   cargo install tomlsmith-lsp --locked
   ```

2. Make it reachable — keep Cargo's bin directory on `PATH`, or point the setting at the binary:

   ```json
   {
     "tomlsmith.server.path": "/absolute/path/to/tomlsmith-lsp"
   }
   ```

If the server fails to start, the extension reports the command that failed. Correcting `tomlsmith.server.path` takes effect without reloading the window.

Packagers can stage a built binary into a locally packaged VSIX with `pnpm bundle-server --binary <path-to-tomlsmith-lsp>`; see [CONTRIBUTING.md](CONTRIBUTING.md) for details.

For extension source development, follow [CONTRIBUTING.md](CONTRIBUTING.md).

## Settings

| Setting | Default | Takes effect | Purpose |
| --- | --- | --- | --- |
| `tomlsmith.server.path` | `tomlsmith-lsp` | Restarts the server | Language-server command or absolute path; when not set explicitly, a bundled server binary is preferred over the `PATH` lookup |
| `tomlsmith.server.arguments` | `[]` | Restarts the server | Additional arguments passed to `tomlsmith-lsp` |
| `tomlsmith.server.environment` | `{}` | Restarts the server | Environment variables added when launching `tomlsmith-lsp` |
| `tomlsmith.toml.version` | `1.1` | Immediately | TOML version used for diagnostics and formatting; select 1.0 explicitly only when the file must remain readable by a 1.0-only consumer |
| `tomlsmith.format.indentWidth` | `null` | Immediately | Formatter indentation width; `null` follows the editor tab size |
| `tomlsmith.format.lineWidth` | `100` | Immediately | Preferred formatter line width |
| `tomlsmith.format.lineEnding` | `preserve` | Immediately | Preserve, LF, or CRLF line endings |
| `tomlsmith.format.generatedFiles` | `skip` | Immediately | Whether **Format Document** touches generated files |

Changing any `tomlsmith.server.*` setting automatically restarts the language server; `tomlsmith.toml.version` and the `tomlsmith.format.*` settings are pushed to the running server and apply without a restart.

In Restricted Mode, workspace-level overrides of `tomlsmith.server.path`, `tomlsmith.server.arguments`, and `tomlsmith.server.environment` are ignored.

## Formatting behavior

- By default, **Format Document** skips generated files: the lockfiles `Cargo.lock`, `uv.lock`, `poetry.lock`, and `pdm.lock`, and any file whose leading comments carry a marker such as `@generated`. Set `tomlsmith.format.generatedFiles` to `format` to format them anyway.
- A document with syntax errors is not formatted. The reason is written to the TomlSmith output log rather than shown as a popup.

## Language status

While a TOML file is open, a **TomlSmith** entry in the language status area (the `{}` indicator in the status bar) shows the server state — starting, running, stopped, or failed with the failure detail — and offers a **Restart Server** action.

## Commands

- **TomlSmith: Restart Language Server** — restart the current language-server process on demand.

## Acknowledgements

[Even Better TOML](https://marketplace.visualstudio.com/items?itemName=tamasfe.even-better-toml) and its [Taplo](https://github.com/tamasfe/taplo) language tooling helped establish the TOML editor experience users expect and informed TomlSmith's feature-gap checklist for folding, symbol navigation, refactoring, and Schema intelligence. TomlSmith is an independent implementation; thanks to Tamás Fehér and every Taplo contributor for advancing TOML tooling.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

TomlSmith for VS Code is released under the [MIT License](LICENSE).
