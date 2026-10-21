import "server-only";

import { arch, platform, release } from "node:os";

import { parseUsageLimit } from "./errors";
import { getCodexCredential, type CodexCredential } from "./token-store";
import { collectResponseFromSse, createResponseDoneRename, rewriteCodexRequestBody } from "./wire";

// The fetch the AI SDK's OpenAI provider calls instead of the global one. It
// turns a standard Responses request into a Codex subscription request:
// headers from the stored OAuth credential, the body rewrite from wire.ts, the
// response.done rename, one refresh-and-retry on 401, and a typed error on a
// usage-limit 429. Headers are what pi sends; the originator value is
// whitelisted upstream, so it stays "pi".

const USER_AGENT = `pi (${platform()} ${release()}; ${arch()})`;

/** Counters for the spike notes and the health route. Per server instance. */
export const codexWireStats = { responseDoneRenamed: 0, refreshRetries: 0, foldedJson: 0 };

function buildHeaders(init: HeadersInit | undefined, credential: CodexCredential, sessionId: string | undefined): Headers {
  const headers = new Headers(init);
  headers.set("Authorization", `Bearer ${credential.accessToken}`);
  headers.set("chatgpt-account-id", credential.accountId);
  headers.set("originator", "pi");
  headers.set("User-Agent", USER_AGENT);
  headers.set("OpenAI-Beta", "responses=experimental");
  headers.set("accept", "text/event-stream");
  headers.set("content-type", "application/json");
  if (sessionId) {
    headers.set("session-id", sessionId);
    headers.set("x-client-request-id", sessionId);
  }
  return headers;
}

function rewriteBody(body: BodyInit | null | undefined): { body?: string; sessionId?: string; wantsJson: boolean } {
  if (typeof body !== "string") return { wantsJson: false };
  const json: unknown = JSON.parse(body);
  if (typeof json !== "object" || json === null || Array.isArray(json)) return { body, wantsJson: false };
  const rewritten = rewriteCodexRequestBody(json as Record<string, unknown>);
  return { body: JSON.stringify(rewritten.body), sessionId: rewritten.sessionId, wantsJson: rewritten.wantsJson };
}

export const codexFetch: typeof fetch = async (input, init) => {
  const { body, sessionId, wantsJson } = rewriteBody(init?.body);
  const send = (credential: CodexCredential) =>
    fetch(input, {
      ...init,
      body: body ?? init?.body,
      headers: buildHeaders(init?.headers, credential, sessionId),
    });

  let credential = await getCodexCredential();
  let response = await send(credential);

  if (response.status === 401) {
    // Refresh once with the rejected token as evidence, then retry once.
    await response.body?.cancel();
    codexWireStats.refreshRetries += 1;
    credential = await getCodexCredential({ rejectedAccessToken: credential.accessToken });
    response = await send(credential);
  }

  if (response.status === 429) {
    const text = await response.text();
    const usageLimit = parseUsageLimit(429, text);
    if (usageLimit) throw usageLimit;
    return new Response(text, { status: 429, statusText: response.statusText, headers: response.headers });
  }

  if (!response.ok || !response.body) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");

  if (wantsJson) {
    codexWireStats.foldedJson += 1;
    const folded = collectResponseFromSse(await response.text());
    headers.set("content-type", "application/json");
    return new Response(JSON.stringify(folded), { status: 200, headers });
  }

  return new Response(
    response.body.pipeThrough(
      createResponseDoneRename(() => {
        codexWireStats.responseDoneRenamed += 1;
      }),
    ),
    { status: response.status, statusText: response.statusText, headers },
  );
};
