import { defineConfig, devices } from "@playwright/test";

import { STATE_PATH } from "./e2e/global-setup";

// End-to-end tests against `next dev`. PORT picks the dev server port (the
// chat agent's worktree uses 3104 so it does not collide with other servers).
// e2e/global-setup.ts signs up a throwaway user and saves the session that
// every spec starts from.
const port = Number(process.env.PORT ?? 3000);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Agent turns call a real model; give each scenario room.
  timeout: 180_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    storageState: STATE_PATH,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    // PLAYWRIGHT_CHANNEL=chrome uses the installed Google Chrome instead of
    // the bundled browser (no `npx playwright install` needed).
    ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
  },
  webServer: {
    command: `npx next dev -p ${port}`,
    // The chat-lab specs drive the spike tools (echo_places, slow_count);
    // real turns never get them. A reused server must be started with it too.
    env: { AGENT_DEV_TOOLS: "1" },
    url: `http://localhost:${port}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
