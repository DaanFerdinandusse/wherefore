import { z } from "zod";

import { readAccessToken } from "./jwt";

// The shape of ~/.codex/auth.json written by the Codex CLI (and of the
// CODEX_AUTH_JSON seed). Only the access and refresh tokens are kept; the id
// token is not needed for requests and is dropped.

const codexAuthJsonSchema = z.object({
  tokens: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    account_id: z.string().min(1).optional(),
  }),
  last_refresh: z.string().optional(),
});

export type ImportedCodexAuth = {
  accessToken: string;
  refreshToken: string;
  accountId: string;
  expiresAt: Date;
  lastRefresh?: Date;
};

/** @throws when the JSON is not a Codex CLI auth file or the access token lacks the account claim. */
export function parseCodexAuthJson(raw: string): ImportedCodexAuth {
  const parsed = codexAuthJsonSchema.parse(JSON.parse(raw));
  const claims = readAccessToken(parsed.tokens.access_token);
  const lastRefresh = parsed.last_refresh ? new Date(parsed.last_refresh) : undefined;
  return {
    accessToken: parsed.tokens.access_token,
    refreshToken: parsed.tokens.refresh_token,
    // The JWT claim is what the endpoint checks; the file's copy is a fallback.
    accountId: claims.accountId || parsed.tokens.account_id || "",
    expiresAt: claims.expiresAt,
    lastRefresh: lastRefresh && !Number.isNaN(lastRefresh.getTime()) ? lastRefresh : undefined,
  };
}
