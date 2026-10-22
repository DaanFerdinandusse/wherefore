import { configDefaults, defineConfig } from "vitest/config";

// Unit tests only; e2e/** belongs to Playwright.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
