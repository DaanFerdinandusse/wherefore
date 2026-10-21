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
    include: ["lib/**/*.test.ts", "workflows/**/*.test.ts", "components/**/*.test.ts?(x)"],
    // Agent worktrees live under .claude/worktrees and must not be scanned.
    exclude: ["node_modules/**", ".claude/**", ".next/**", "e2e/**"],
    setupFiles: ["./vitest.setup.ts", "./lib/db/__tests__/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
