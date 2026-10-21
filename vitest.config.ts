import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
    // Server-only modules import "server-only", which only resolves under the
    // react-server condition outside Next.
    conditions: ["react-server"],
  },
  test: {
    include: ["lib/**/*.test.ts", "workflows/**/*.test.ts", "components/**/*.test.ts?(x)"],
    exclude: ["node_modules/**", ".claude/**", ".next/**", "e2e/**"],
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
  },
});
