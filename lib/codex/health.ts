import "server-only";

import { timingSafeEqual } from "node:crypto";

import { generateText } from "ai";

import { codexWireStats } from "./fetch";
import { agentModelRef, agentProviderOptions, resolveModel } from "./provider";
import { describeCodexCredential } from "./token-store";

// The deploy check for the model subscription, in two depths:
//
//   passive (public): is it configured? The provider's settings are set, the
//     credential row exists and its token has not expired. No model call, no
//     refresh, no secrets.
//   active (signed in, or `Authorization: Bearer $HEALTH_SECRET`): one tiny
//     completion through the configured provider. At most one real call per
//     minute per instance; within the minute the last result is returned.

export type PassiveHealth = {
  ok: boolean;
  mode: "passive";
  model: string;
  config: { provider: "codex" | "openai"; ok: boolean; missing: string[] };
  credential?: { connected: boolean; expired?: boolean; expiresAt?: string; lastRefresh?: string | null };
  error?: string;
};

export type ActiveHealth =
  | {
      ok: true;
      mode: "active";
      model: string;
      ms: number;
      text: string;
      checkedAt: string;
      cached: boolean;
      wire: typeof codexWireStats;
    }
  | { ok: false; mode: "active"; model: string; ms: number; error: string; checkedAt: string; cached: boolean };

export const PROBE_INTERVAL_MS = 60_000;

/** Configuration and credential presence only. Never calls the model or refreshes a token. */
export async function checkModelConfig(now = Date.now()): Promise<PassiveHealth> {
  const model = agentModelRef();
  const provider = model.startsWith("openai/") ? "openai" : "codex";
  const required = provider === "openai" ? ["OPENAI_API_KEY"] : ["CODEX_TOKEN_KEY", "DATABASE_URL"];
  const missing = required.filter((name) => !process.env[name]);
  const config = { provider, ok: missing.length === 0, missing } as const;
  if (provider === "openai") return { ok: config.ok, mode: "passive", model, config: { ...config, missing } };
  try {
    const credential = await describeCodexCredential();
    if (!credential.connected) {
      return { ok: false, mode: "passive", model, config: { ...config, missing }, credential: { connected: false } };
    }
    const expired = credential.expiresAt.getTime() <= now;
    return {
      // An expired access token is fine while a refresh token can rotate it,
      // but it means no call has refreshed it lately: report it, fail the check.
      ok: config.ok && !expired,
      mode: "passive",
      model,
      config: { ...config, missing },
      credential: {
        connected: true,
        expired,
        expiresAt: credential.expiresAt.toISOString(),
        lastRefresh: credential.lastRefresh?.toISOString() ?? null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      mode: "passive",
      model,
      config: { ...config, missing },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** True when the header carries `Bearer $HEALTH_SECRET` (compared in constant time). */
export function hasHealthSecret(authorization: string | null, secret = process.env.HEALTH_SECRET): boolean {
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const given = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

let lastProbe: { result: ActiveHealth; at: number } | undefined;
let inflight: Promise<ActiveHealth> | undefined;

/** One tiny completion through the configured provider, rate limited per instance. */
export async function probeModel(now = Date.now()): Promise<ActiveHealth> {
  if (lastProbe && now - lastProbe.at < PROBE_INTERVAL_MS) return { ...lastProbe.result, cached: true };
  inflight ??= runProbe().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

async function runProbe(): Promise<ActiveHealth> {
  const model = agentModelRef();
  const started = Date.now();
  let result: ActiveHealth;
  try {
    const response = await generateText({
      model: resolveModel(model),
      prompt: "Reply with the single word: ok",
      providerOptions: agentProviderOptions("health-check"),
      maxRetries: 0,
      timeout: 30_000,
    });
    result = {
      ok: true,
      mode: "active",
      model,
      ms: Date.now() - started,
      text: response.text.trim().slice(0, 40),
      checkedAt: new Date().toISOString(),
      cached: false,
      wire: { ...codexWireStats },
    };
  } catch (error) {
    result = {
      ok: false,
      mode: "active",
      model,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      checkedAt: new Date().toISOString(),
      cached: false,
    };
  }
  lastProbe = { result, at: Date.now() };
  return result;
}
