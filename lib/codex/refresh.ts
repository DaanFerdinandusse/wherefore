import { z } from "zod";

import { readAccessToken } from "./jwt";

// One OAuth refresh against auth.openai.com, the protocol pi-ai's
// openai-codex OAuth uses. The response ROTATES the refresh token: the old one
// stops working, which is why the caller (token-store.ts) single-flights this
// through a lease. Daan's local Codex CLI shares the same refresh token, so
// every refresh here also invalidates the CLI's copy; refresh only when needed.

export const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number(),
});

export type RefreshedTokens = {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  expiresAt: Date;
};

/** @throws on a non-2xx answer (body included, tokens never logged) or a malformed response. */
export async function refreshCodexTokens(
  refreshToken: string,
  { fetchImpl = fetch, signal }: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<RefreshedTokens> {
  const response = await fetchImpl(CODEX_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CODEX_CLIENT_ID,
    }),
    signal: signal ?? AbortSignal.timeout(20_000), // Well under the 60 s refresh lease (lease.ts).
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Codex token refresh failed (${response.status}): ${text.slice(0, 300)}`);
  }
  const body = tokenResponseSchema.parse(await response.json());
  const claims = readAccessToken(body.access_token);
  // The earlier of the JWT's exp and expires_in, so a clock skew never makes
  // us hold a token longer than either side thinks it lives.
  const fromExpiresIn = Date.now() + body.expires_in * 1000;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    accountId: claims.accountId,
    expiresAt: new Date(Math.min(claims.expiresAt.getTime(), fromExpiresIn)),
  };
}
