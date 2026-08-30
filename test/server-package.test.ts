import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const serverBinary = process.env.TOMLSMITH_LSP_SMOKE_BINARY;
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function frame(payload: object): string {
  const json = JSON.stringify(payload);
  return `Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
}

test.skipIf(serverBinary === undefined)(
  "the staged server completes an LSP session and reports the published package version",
  () => {
    if (serverBinary === undefined) {
      throw new Error("TOMLSMITH_LSP_SMOKE_BINARY is required for this test");
    }
    const input = [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { capabilities: {} } },
      { jsonrpc: "2.0", method: "initialized", params: {} },
      { jsonrpc: "2.0", id: 2, method: "shutdown", params: null },
      { jsonrpc: "2.0", method: "exit", params: null },
    ]
      .map(frame)
      .join("");
    const result = spawnSync(serverBinary, [], {
      encoding: "utf8",
      input,
      timeout: 10_000,
    });
    const serverPackage = JSON.parse(
      readFileSync(`${repositoryRoot}/server-package.json`, "utf8"),
    ) as { version: string };

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain('"id":1');
    expect(result.stdout).toContain(
      `"serverInfo":{"name":"TomlSmith","version":"${serverPackage.version}"}`,
    );
    expect(result.stdout).toContain('"id":2,"result":null');
  },
);
