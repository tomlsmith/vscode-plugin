import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^vscode$/,
        replacement: fileURLToPath(new URL("./test/support/vscode.ts", import.meta.url)),
      },
      {
        find: /^vscode-languageclient\/node$/,
        replacement: fileURLToPath(
          new URL("./test/support/languageclient.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    clearMocks: true,
  },
});
