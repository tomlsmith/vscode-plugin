# Contributing to TomlSmith for VS Code

Thank you for improving the TomlSmith VS Code adapter. Changes must keep the editor/server seam explicit and testable.

## Before starting

- Search existing issues and pull requests before proposing duplicate work.
- Keep pull requests focused on observable VS Code integration behavior.
- Propose TOML syntax, semantic, diagnostic, or formatter behavior in the [TomlSmith core repository](https://github.com/tomlsmith/tomlsmith), not in this adapter.
- Report security-sensitive issues privately to `1357711537@qq.com` rather than in a public issue.

## Development setup

Install Node.js 22 and enable the pnpm version declared in `package.json`, then run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Systematic unit and extension-adapter tests use Vitest. Do not add standalone JavaScript test scripts. Manifest and policy constraints may be verified directly without artificial tests.

Markdown prose is not manually wrapped to a source-column width. Keep each ordinary paragraph, list item, and blockquote paragraph on one physical source line; retain separate lines only where Markdown structure requires them.

### Local packaging with a bundled server

Run `pnpm bundle-server --binary <path-to-tomlsmith-lsp>` to stage a built server binary under `server/<platform>-<arch>/` before packaging a VSIX locally; pass `--platform` and `--arch` to stage a binary for another target. Staging a darwin or linux target is refused on a Windows host, because NTFS cannot carry the executable bit `vsce` preserves and the packaged binary would fail to spawn. At launch the extension prefers an explicitly configured `tomlsmith.server.path`, then a bundled binary matching the current platform, then a `tomlsmith-lsp` found on `PATH`.

The `server/` directory is a local packaging input only: it is git-ignored and must never be committed, while `.vscodeignore` keeps it visible to `vsce package` so a locally packaged VSIX ships the binary.

CI and release packaging read `server-package.json` and install that exact `tomlsmith-lsp` version from crates.io. Pull requests build and inspect a Linux x64 VSIX, while the **Package platform VSIX artifacts** workflow builds five platform packages. Both workflows test the server before packaging and after extraction, then install the target VSIX into an isolated VS Code 1.95 profile, activate the installed extension, require a diagnostic from the bundled server, and execute a real formatting request. A version tag creates a GitHub Release only after all five packages pass, and attaches the tested VSIX files plus their SHA-256 checksums. The install-level check is a Vitest test and can be reproduced with `TOMLSMITH_VSIX_E2E=/absolute/path/to/tomlsmith-<target>.vsix pnpm exec vitest run test/vsix-install.test.ts`; set `TOMLSMITH_VSCODE_EXECUTABLE` to an existing VS Code executable to avoid downloading the minimum supported version.

## Adapter boundary

The extension owns VS Code activation, settings, commands, language registration, process launch, and language-client lifecycle. It must not parse TOML, reinterpret diagnostics, reproduce formatter rules, or depend on source files inside the [core repository](https://github.com/tomlsmith/tomlsmith).

The integration seam is the `tomlsmith-lsp` process interface. Development may point the setting at any compatible local executable, but source-level imports, Git dependencies, submodules, and Core checkout requirements are not accepted dependencies.

Tests should exercise behavior through `startExtension`, the extension activation interface, and observable language-client plans. Keep host and client adapters small, and avoid testing private implementation details.

## Pull requests

Before requesting review:

1. Run `pnpm typecheck`, `pnpm test`, and `pnpm build`.
2. Explain the user-visible behavior and VS Code/server compatibility impact.
3. Update English and Simplified Chinese documentation together when user-facing instructions change.
4. State any platform or packaged-server limitation explicitly.
5. Keep commits attributable and free of generated bundles, server binaries, secrets, and private data.

By contributing, you agree that your contribution is licensed under the MIT License used by this repository.
