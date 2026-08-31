# Changelog

All notable user-facing changes to TomlSmith for VS Code are documented here.

## [0.1.0] - 2026-08-31

### Added

- Live TOML diagnostics powered by the published TomlSmith language server.
- Document formatting with indentation, preferred line width, line-ending, and generated-file controls.
- TextMate and semantic highlighting, hover information, document symbols, and folding ranges.
- Explicit TOML 1.0 and TOML 1.1 modes, with TOML 1.0 as the compatibility default.
- Automatic language-server restart after server launch settings change, plus a manual restart command and language status indicator.
- Five platform-specific packages with a bundled `tomlsmith-lsp` for macOS x64/arm64, non-Alpine Linux x64/arm64, and Windows x64.
- A universal Marketplace fallback for other platforms, using an explicitly configured or `PATH`-provided `tomlsmith-lsp`.
- Migration notes for users moving from Even Better TOML.

[0.1.0]: https://github.com/tomlsmith/vscode-plugin/releases/tag/v0.1.0
