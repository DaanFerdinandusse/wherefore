import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { parseCodexAuthJson } from "./auth-json";
import { decryptToken, encryptToken, parseTokenKey } from "./crypto";
import { parseUsageLimit, usageLimitMessage } from "./errors";
import { readAccessToken } from "./jwt";
import { collectResponseFromSse, createResponseDoneRename, rewriteCodexRequestBody } from "./wire";

function fakeJwt(payload: Record<string, unknown>): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64(payload)}.sig`;
}

const exp = Math.floor(Date.parse("2026-10-25T00:00:00Z") / 1000);
const access = fakeJwt({ exp, "https://api.openai.com/auth": { chatgpt_account_id: "acct_1" } });

describe("rewriteCodexRequestBody", () => {
  it("forces the stateless streaming shape and moves the system prompt to instructions", () => {
    const { body, sessionId, wantsJson } = rewriteCodexRequestBody({
      model: "gpt-6-luna",
      input: [
        { role: "developer", content: "Be brief." },
        { role: "user", content: [{ type: "input_text", text: "hi" }] },
      ],
      store: true,
      max_output_tokens: 5,
      previous_response_id: "resp_1",
      prompt_cache_retention: "24h",
      prompt_cache_key: "chat-123",
      reasoning: { effort: "low" },
      tools: [{ type: "function", name: "x" }],
    });
    expect(body).toMatchObject({
      store: false,
      stream: true,
      instructions: "Be brief.",
      include: ["reasoning.encrypted_content"],
      text: { verbosity: "low" },
      reasoning: { effort: "low", summary: "auto" },
      tool_choice: "auto",
      parallel_tool_calls: true,
      prompt_cache_key: "chat-123",
    });
    expect(body.input).toEqual([{ role: "user", content: [{ type: "input_text", text: "hi" }] }]);
    expect(body).not.toHaveProperty("max_output_tokens");
    expect(body).not.toHaveProperty("previous_response_id");
    expect(body).not.toHaveProperty("prompt_cache_retention");
    expect(sessionId).toBe("chat-123");
    expect(wantsJson).toBe(true);
  });

  it("keeps existing instructions, adds a default when there are none, and clamps the cache key", () => {
    expect(rewriteCodexRequestBody({ input: [], stream: true }).body.instructions).toBe("You are a helpful assistant.");
    const long = "k".repeat(80);
    const out = rewriteCodexRequestBody({ input: [], stream: true, instructions: "A", prompt_cache_key: long });
    expect(out.body.instructions).toBe("A");
    expect(out.sessionId).toHaveLength(64);
    expect(out.wantsJson).toBe(false);
  });
});

describe("SSE helpers", () => {
  it("renames response.done to response.completed across chunk boundaries", async () => {
    let renamed = 0;
    const source = 'event: response.done\ndata: {"type":"response.done","response":{"id":"r"}}\n\n';
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(source.slice(0, 13)));
        c.enqueue(enc.encode(source.slice(13)));
        c.close();
      },
    }).pipeThrough(createResponseDoneRename(() => renamed++));
    const text = await new Response(stream).text();
    expect(text).toContain("event: response.completed");
    expect(text).toContain('"type":"response.completed"');
    expect(text).not.toContain("response.done");
    expect(renamed).toBeGreaterThan(0);
  });

  it("folds a stream into one response and rebuilds output from item events", () => {
    const sse = [
      'data: {"type":"response.output_item.done","item":{"type":"message","id":"m1"}}',
      'data: {"type":"response.completed","response":{"id":"r1","output":[],"usage":{"input_tokens":1}}}',
    ].join("\n");
    expect(collectResponseFromSse(sse)).toEqual({
      id: "r1",
      output: [{ type: "message", id: "m1" }],
      usage: { input_tokens: 1 },
    });
    expect(() => collectResponseFromSse('data: {"type":"error","message":"nope"}')).toThrow("nope");
  });
});

describe("credentials", () => {
  it("round-trips tokens through AES-GCM and rejects a wrong key", () => {
    const key = parseTokenKey(randomBytes(32).toString("base64"));
    const sealed = encryptToken("secret-token", key);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decryptToken(sealed, key)).toBe("secret-token");
    expect(() => decryptToken(sealed, randomBytes(32))).toThrow();
    expect(() => parseTokenKey("short")).toThrow("32 bytes");
  });

  it("reads the account id and expiry from the access token and the CLI auth file", () => {
    expect(readAccessToken(access)).toEqual({ accountId: "acct_1", expiresAt: new Date(exp * 1000) });
    const imported = parseCodexAuthJson(
      JSON.stringify({ tokens: { id_token: "x", access_token: access, refresh_token: "r1" }, last_refresh: "2026-10-01T00:00:00Z" }),
    );
    expect(imported).toMatchObject({ accessToken: access, refreshToken: "r1", accountId: "acct_1" });
  });

  it("types a usage-limit 429 and ignores a plain rate limit", () => {
    const now = Date.parse("2026-10-21T10:00:00Z");
    const resets = Math.floor((now + 40 * 60_000) / 1000);
    const error = parseUsageLimit(
      429,
      JSON.stringify({ error: { type: "usage_limit_reached", plan_type: "pro", resets_at: resets } }),
      now,
    );
    expect(error?.name).toBe("CodexUsageLimitError");
    expect(error?.resetsAt?.getTime()).toBe(resets * 1000);
    expect(usageLimitMessage(error?.resetsAt, now)).toBe("Subscription limit reached, resets in 40 min.");
    expect(parseUsageLimit(429, JSON.stringify({ error: { type: "rate_limit_exceeded" } }), now)).toBeUndefined();
    expect(parseUsageLimit(500, "{}", now)).toBeUndefined();
  });
});
