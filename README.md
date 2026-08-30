# TomlSmith for VS Code

**English** | [简体中文](README.zh-Hans.md)

[![CI](https://github.com/tomlsmith/vscode-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/tomlsmith/vscode-plugin/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**TOML diagnostics and formatting in VS Code.**

TomlSmith for VS Code uses [TomlSmith](https://github.com/tomlsmith/tomlsmith) for `.toml` files and named TOML files such as `Cargo.lock` and `Pipfile`. It supports TOML 1.0 and 1.1.

## Features

- View diagnostics while editing TOML files.
- Format a document with VS Code's **Format Document** action. The extension applies the edits returned by the language server instead of replacing the whole document.
- Highlight keys, values, tables, comments, and literals with TextMate and semantic tokens.
- View a key's path and TOML value kind on hover.
- Navigate document symbols and fold TOML structures.
- Validate as TOML 1.0 by default, or opt in to TOML 1.1 explicitly.
- Configure indentation, preferred line width, line endings, and whether generated files are formatted.

The extension does not provide completion, Schema integration, or code actions. Switching from Even Better TOML? See the [migration notes](docs/even-better-toml.md).

## Supported files

The extension registers TOML for `.toml` files and these filenames: `Cargo.lock`, `Pipfile`, `uv.lock`, `poetry.lock`, and `pdm.lock`.

## Set up the language server

The platform-specific TomlSmith releases for macOS x64/arm64, non-Alpine Linux x64/arm64, and Windows x64 include a compatible `tomlsmith-lsp`; installing the matching VSIX requires no separate server setup. The same applies when VS Code installs the extension on the workspace side of a supported Remote-SSH, WSL, or Dev Container environment. Bundled packages do not cover Alpine or Windows Arm64, so those platforms must use an explicitly configured or `PATH` server.

The extension talks to a `tomlsmith-lsp` executable, resolved in this order:

1. An explicitly configured `tomlsmith.server.path` setting.
2. A server binary bundled inside the extension package, when one is present for the current platform.
3. A `tomlsmith-lsp` found on `PATH`.

For extension development or an unsupported platform, if neither a bundled server binary nor one on `PATH` is available, install the published server crate:

1. Install the exact compatible version from crates.io:

   ```bash
   cargo install tomlsmith-lsp --version '=0.1.0' --locked
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
| `tomlsmith.toml.version` | `1.0` | Immediately | TOML version used for diagnostics and formatting; both modes implement published specifications, while 1.0 is the compatibility default for ecosystem files and 1.1 is an explicit opt-in |
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

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

TomlSmith for VS Code is released under the [MIT License](LICENSE).
