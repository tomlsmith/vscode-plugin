# TomlSmith for VS Code support

## Get help or report a bug

Use [GitHub Issues](https://github.com/tomlsmith/vscode-plugin/issues) for extension setup problems, crashes, VS Code integration bugs, and feature requests. Search existing issues first and include the extension version, VS Code version, operating system and architecture, whether the workspace is local or remote, and the relevant lines from the **TomlSmith** output channel. Please reduce TOML examples and remove credentials or private data before posting them.

Parser, formatter, diagnostic, and language-server behavior is owned by [TomlSmith Core](https://github.com/tomlsmith/tomlsmith/issues). Report the issue there when it reproduces with the `tomlsmith` CLI or `tomlsmith-lsp` independently of VS Code.

## Supported installation paths

TomlSmith for VS Code 0.1.0 uses `tomlsmith-lsp` 0.1.0. Marketplace and GitHub Release packages for macOS x64/arm64, non-Alpine Linux x64/arm64, and Windows x64 bundle the server. The universal fallback does not bundle an executable; install the compatible server with `cargo install tomlsmith-lsp --version '=0.1.0' --locked`, then configure `tomlsmith.server.path` or expose the executable on `PATH`.

The minimum supported editor version is VS Code 1.95. Remote-SSH, WSL, and Dev Container installations are supported when VS Code can install the extension and run the server on the workspace side. Virtual workspaces are not supported because the language server needs a real filesystem and process.

## Security reports

Do not open a public issue for a suspected vulnerability. Send a private report to `1357711537@qq.com` with affected versions, impact, and reproduction details. Do not include unrelated secrets or personal data. You should receive an acknowledgement within seven days.
