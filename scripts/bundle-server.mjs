// Stages a tomlsmith-lsp binary for local packaging: copies it into
// server/<platform>-<arch>/ where the extension's bundled-server resolution
// and `vsce package` expect it. The server/ directory is git-ignored and must
// never be committed.
import { chmodSync, copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

function fail(message) {
  console.error(`bundle-server: ${message}`);
  console.error(
    "usage: node scripts/bundle-server.mjs --binary <path> [--platform <platform>] [--arch <arch>]",
  );
  process.exit(1);
}

function parseArguments(argv) {
  const options = {
    binary: undefined,
    platform: process.platform,
    arch: process.arch,
  };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    if (flag !== "--binary" && flag !== "--platform" && flag !== "--arch") {
      fail(`unknown argument: ${flag}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail(`missing value for ${flag}`);
    }
    options[flag.slice(2)] = value;
  }
  if (options.binary === undefined) {
    fail("--binary <path> is required");
  }
  return options;
}

const { binary, platform, arch } = parseArguments(process.argv.slice(2));
// vsce packs each entry with the file mode it stats, and NTFS has no POSIX
// executable bit: a darwin/linux-targeted VSIX staged on Windows would ship
// a server binary that fails to spawn with EACCES.
if (process.platform === "win32" && platform !== "win32") {
  fail(
    `staging a ${platform} server on a Windows host cannot preserve the executable bit; package on a ${platform} host instead`,
  );
}
const source = resolve(binary);

let sourceStats;
try {
  sourceStats = statSync(source);
} catch {
  fail(`server binary not found: ${source}`);
}
if (!sourceStats.isFile()) {
  fail(`server binary is not a regular file: ${source}`);
}

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const destination = join(
  repositoryRoot,
  "server",
  `${platform}-${arch}`,
  platform === "win32" ? "tomlsmith-lsp.exe" : "tomlsmith-lsp",
);

mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
// vsce preserves file modes, so the packaged server must carry the
// executable bit the extension needs to spawn it.
chmodSync(destination, 0o755);

console.log(`bundled ${source} -> ${destination}`);
