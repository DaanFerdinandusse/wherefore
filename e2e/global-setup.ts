import { mkdirSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";

import { request, type FullConfig } from "@playwright/test";

// Signs up (or signs in) one throwaway test user on the local dev server
// through the app's own auth route and saves the session for every spec
// (playwright.config.ts points `storageState` at STATE_PATH). Credentials
// live in e2e/.auth/, which is gitignored; set E2E_EMAIL and E2E_PASSWORD to
// reuse an account across runs.
export const STATE_PATH = "e2e/.auth/state.json";

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const email = process.env.E2E_EMAIL ?? `e2e-${randomBytes(4).toString("hex")}@tastebrief.test`;
  const password = process.env.E2E_PASSWORD ?? randomBytes(12).toString("base64url");

  const api = await request.newContext({ baseURL });
  const signUp = await api.post("/api/auth/sign-up/email", {
    data: { name: "E2E Advisor", email, password },
  });
  if (!signUp.ok()) {
    // The account may exist from a previous run with fixed credentials.
    const signIn = await api.post("/api/auth/sign-in/email", { data: { email, password } });
    if (!signIn.ok()) {
      throw new Error(
        `Could not sign up or sign in the e2e user: ${signUp.status()} ${await signUp.text()} / ${signIn.status()} ${await signIn.text()}`,
      );
    }
  }
  // The app bar runs ensureAdvisor on the first signed-in page view.
  const home = await api.get("/trips");
  if (home.status() >= 500) throw new Error(`/trips failed after sign-in: ${home.status()}`);

  mkdirSync(dirname(STATE_PATH), { recursive: true });
  await api.storageState({ path: STATE_PATH });
  writeFileSync("e2e/.auth/credentials.json", JSON.stringify({ email, password }, null, 2));
  await api.dispose();
}
