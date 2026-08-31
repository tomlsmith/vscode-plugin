# Changelog

All notable user-facing changes to TomlSmith for VS Code are documented here.

## [Unreleased]

### Changed

- TOML 1.1 is now the default language version for validation and formatting; strict TOML 1.0 remains available for files consumed by 1.0-only tools.
- Dark+ now distinguishes inline-table member keys from their outer property keys by default across semantic and TextMate highlighting, with user and workspace color settings retaining precedence.
- Expanded the installed-VSIX release gate to exercise real hover, folding, hierarchical document symbols, and symbol navigation in addition to diagnostics and formatting.
- Added theme-safe TOML semantic modifiers and documented Dark+ color customization for scalar keys, array-valued keys, inline-table-valued keys, inline-table member keys, tables, arrays of tables, date-times, and invalid syntax.

## [0.2.0] - 2026-08-31

### Added

- Theme-aware property and namespace scopes that visually distinguish keys from table and array-of-tables headers across TextMate and semantic highlighting.
- Release-package validation for the complete Problems diagnostic contract: Error severity, `tomlsmith` source, stable code, and a readable message.

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

[Unreleased]: https://github.com/tomlsmith/vscode-plugin/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/tomlsmith/vscode-plugin/releases/tag/v0.2.0
[0.1.0]: https://github.com/tomlsmith/vscode-plugin/releases/tag/v0.1.0
