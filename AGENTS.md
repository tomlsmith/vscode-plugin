# TomlSmith for VS Code agent instructions

This repository is a thin VS Code adapter around the external `tomlsmith-lsp` process. Read `CONTRIBUTING.md` before changing activation, settings, commands, language registration, packaging, or the language-client lifecycle.

## Adapter boundary

- The extension owns VS Code activation, manifest contributions, settings, commands, process launch, file synchronization, and language-client lifecycle.
- TOML parsing, semantic analysis, diagnostics, formatter behavior, hover and symbol behavior, and language-version rules belong in [TomlSmith core](https://github.com/tomlsmith/tomlsmith) and the language server; do not reproduce them here.
- Integrate with core only through a compatible `tomlsmith-lsp` executable. CI and release packaging install the exact published crate version declared in `server-package.json`; do not import core source files, add a core submodule, depend on a Git checkout, or commit a server binary.
- Keep `src/runtime.ts` independent of `vscode` and `vscode-languageclient`. Put lifecycle decisions and the observable `ClientPlan` there; keep `src/extension.ts` as the small real-host adapter.
- `package.json` owns language registration, the TextMate grammar owns lexical scopes, and `language-configuration.json` owns comments, brackets, pairs, and folding; none of them is an alternate validator or formatter.

## Manifest and LSP contract

- Treat `package.json` as public API. When changing a language, filename, command, or setting, review activation, contributions, runtime wiring, tests, both READMEs, and packaging as one change.
- Keep every manifest setting key, type, enum or range, default, and scope consistent with `readSettings()`. Map `server.*` to server launch options and map `toml.version` plus `format.*` to LSP initialization options.
- If supported files change, review the manifest language declaration, activation events, runtime document selectors, filesystem watcher, grammar, and documentation together.
- Preserve the client-plan contract: configured server command with the `tomlsmith-lsp` fallback, arguments, inherited environment plus configured overrides, file and untitled TOML selectors, file synchronization, and TOML and formatter initialization options.
- Serialize start, restart, and stop operations. Configuration changes and the restart command use fresh settings; clean up failed or disposed clients, watchers, commands, and listeners, and surface actionable launch or restart failures to the user.
- Treat the VS Code engine range, type declarations, bundle target, and documented compatibility as one support surface.
- When adding a runtime asset, ensure the final extension package contains it and review build inputs plus `.vscodeignore`. Do not commit `dist/`, `server/`, or `.vsix` artifacts.

## Tests and completion

- Use Vitest for every systematic JavaScript/TypeScript unit, adapter, integration, and end-to-end test; do not add standalone JavaScript test scripts.
- Test lifecycle behavior through `startExtension`; test real adapter wiring through exported `activate` and `deactivate` with the existing VS Code and language-client test adapters. Assert observable client plans and lifecycle effects rather than private implementation details.
- Verify manifest and policy constraints directly from `package.json`, `.vscodeignore`, or related files instead of creating artificial tests that restate them.
- After a fresh checkout or lockfile change, run `pnpm install --frozen-lockfile`. Before finishing a code, manifest, or packaging change, run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
- For packaging changes, verify that every required runtime file remains package-visible and development-only files remain excluded; `pnpm build` alone does not validate the final package contents.
- State the user-visible effect, VS Code and `tomlsmith-lsp` compatibility impact, settings or command impact, packaging impact, and any remaining platform or server limitation in the handoff.

## Documentation

- Update `README.md` and `README.zh-Hans.md` together for user-facing settings, commands, requirements, and limitations. Keep implementation and contributor details in `CONTRIBUTING.md`.
- Keep research, plans, ADR drafts, roadmaps, and agent scratch context under the ignored paths already declared in `.gitignore`.
- Keep each ordinary Markdown paragraph, list item, and blockquote paragraph on one physical source line. Do not add trailing double-space hard breaks or repository-wide Markdown formatting dependencies.
