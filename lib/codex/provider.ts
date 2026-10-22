import "server-only";

import { createOpenAI, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import type { ProviderV4 } from "@ai-sdk/provider";
import { createProviderRegistry, type LanguageModel } from "ai";

import { codexFetch } from "./fetch";
import { CODEX_BASE_URL } from "./wire";

// The model providers, and the registry that names them. A model is
// referenced as "codex/<id>" (the ChatGPT subscription through codexFetch) or
// "openai/<id>" (plain API key, the demo-day fallback). AGENT_PROVIDER picks
// which one the agent uses; AGENT_MODEL picks the id.

export const codexProvider = createOpenAI({
  baseURL: CODEX_BASE_URL,
  // The real credential is injected per request by codexFetch.
  apiKey: "unused",
  fetch: codexFetch,
});

export const openaiProvider = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "missing-openai-api-key",
});

export const modelRegistry = createProviderRegistry(
  { codex: codexProvider, openai: openaiProvider },
  { separator: "/" },
);

export type ModelRef = `${"codex" | "openai"}/${string}`;

/** The model the agent runs on, as a registry reference: "codex/gpt-6-luna" by default. */
export function agentModelRef(): ModelRef {
  const provider = process.env.AGENT_PROVIDER === "openai" ? "openai" : "codex";
  return `${provider}/${process.env.AGENT_MODEL || "gpt-6-luna"}`;
}

export function resolveModel(ref: string): LanguageModel {
  return modelRegistry.languageModel(ref as `codex/${string}`);
}

/**
 * Installs the registry as the AI SDK default provider, so a bare
 * "codex/gpt-6-luna" string works in generateText and so the workflow's
 * RegistryModel handle can resolve the real model inside a step. Called once
 * from instrumentation.ts at server start. Idempotent.
 */
export function installModelRegistry(): void {
  // The registry is not itself a ProviderV4 (no specificationVersion), so it
  // is installed through a thin adapter that forwards by full reference.
  const asProvider: ProviderV4 = {
    specificationVersion: "v4",
    languageModel: (id) => modelRegistry.languageModel(id as `codex/${string}`),
    embeddingModel: (id) => modelRegistry.embeddingModel(id as `codex/${string}`),
    imageModel: (id) => modelRegistry.imageModel(id as `codex/${string}`),
  };
  globalThis.AI_SDK_DEFAULT_PROVIDER = asProvider;
}

/**
 * Provider options for every call. On Codex they already match what the
 * endpoint requires, so codexFetch's rewrite has little left to do; the
 * prompt cache key (the chat id) doubles as the session-id header.
 */
export function agentProviderOptions(chatId?: string): { openai: OpenAIResponsesProviderOptions } {
  return {
    openai: {
      store: false,
      reasoningEffort: "low",
      reasoningSummary: "auto",
      include: ["reasoning.encrypted_content"],
      textVerbosity: "low",
      ...(chatId ? { promptCacheKey: chatId } : {}),
    },
  };
}
