import { defineConfig, devices } from "@playwright/test";

// End-to-end tests against `next dev`. PORT picks the dev server port (the
// chat agent's worktree uses 3104 so it does not collide with other servers).
const port = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  // Agent turns call a real model; give each scenario room.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // PLAYWRIGHT_CHANNEL=chrome uses the installed Google Chrome instead of
    // the bundled browser (no `npx playwright install` needed).
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: `npx next dev -p ${port}`,
    url: `http://localhost:${port}/api/health/model`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
