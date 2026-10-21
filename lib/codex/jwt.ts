import { z } from "zod";

// The access token is a JWT. We never verify it (the upstream does); we only
// read two claims: the expiry and the ChatGPT account id the endpoint wants in
// the chatgpt-account-id header.

const AUTH_CLAIM = "https://api.openai.com/auth";

const accessClaimsSchema = z.object({
  exp: z.number(),
  [AUTH_CLAIM]: z.object({ chatgpt_account_id: z.string().min(1) }),
});

export type AccessTokenClaims = { accountId: string; expiresAt: Date };

/** @throws when the token is not a JWT carrying exp and the ChatGPT account claim. */
export function readAccessToken(token: string): AccessTokenClaims {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Access token is not a JWT");
  const json: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  const claims = accessClaimsSchema.parse(json);
  return {
    accountId: claims[AUTH_CLAIM].chatgpt_account_id,
    expiresAt: new Date(claims.exp * 1000),
  };
}
