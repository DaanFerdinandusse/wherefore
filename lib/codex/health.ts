import "server-only";

import { generateText } from "ai";

import { codexWireStats } from "./fetch";
import { agentModelRef, agentProviderOptions, resolveModel } from "./provider";
import { describeCodexCredential } from "./token-store";

export type ModelHealth =
  | {
      ok: true;
      model: string;
      ms: number;
      text: string;
      credential?: { expiresAt: string; lastRefresh: string | null };
      wire: typeof codexWireStats;
    }
  | { ok: false; model: string; ms: number; error: string };

/** One tiny completion through the configured provider, for the deploy check. */
export async function checkModelHealth(): Promise<ModelHealth> {
  const model = agentModelRef();
  const started = Date.now();
  try {
    const result = await generateText({
      model: resolveModel(model),
      prompt: "Reply with the single word: ok",
      providerOptions: agentProviderOptions("health-check"),
      maxRetries: 0,
      timeout: 30_000,
    });
    const credential = model.startsWith("codex/") ? await describeCodexCredential() : undefined;
    return {
      ok: true,
      model,
      ms: Date.now() - started,
      text: result.text.trim().slice(0, 40),
      credential:
        credential?.connected === true
          ? { expiresAt: credential.expiresAt.toISOString(), lastRefresh: credential.lastRefresh?.toISOString() ?? null }
          : undefined,
      wire: { ...codexWireStats },
    };
  } catch (error) {
    return {
      ok: false,
      model,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
