import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const root = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\//, replacement: root("./") },
      // The marker package throws outside React Server Components; tests are server code.
      { find: /^server-only$/, replacement: root("./node_modules/server-only/empty.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**"],
    setupFiles: ["./lib/db/__tests__/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
