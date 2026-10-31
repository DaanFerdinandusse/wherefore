import { z } from "zod";

import type { AppUIMessage } from "@/lib/contracts";
import { withoutRegionMarker } from "@/lib/map/region-prompt";

import { shortLine } from "./chat-title";

// The pills the composer offers after a reply: up to three short labels, each
// with the longer message a click puts in the field. This file is the pure
// part, safe on the client: which exchange a follow-up builds on and what is
// kept of the model's answer. The model call lives in next-prompt-data.ts,
// apart from the turn's workflow.

export const NEXT_PROMPT_COUNT = 3;
export const NEXT_LABEL_MIN = 3;
export const NEXT_LABEL_MAX = 28;
export const NEXT_PROMPT_MIN = 8;
export const NEXT_PROMPT_MAX = 140;
const MAX_LINE = 600;
const EARLIER_ASKS = 6;
const EARLIER_LINE = 120;

/** What the client sends: the lines the model reads. */
export const lastExchangeSchema = z.object({
  ask: z.string().max(MAX_LINE + 1),
  reply: z.string().min(1).max(MAX_LINE + 1),
  earlier: z.array(z.string().max(EARLIER_LINE + 1)).max(EARLIER_ASKS).default([]),
});

export type LastExchange = z.infer<typeof lastExchangeSchema>;

/** The model's answer and the route's. The limits are checked in cleanNextPrompts, one pill at a time. */
export const nextPromptsSchema = z.object({
  prompts: z.array(z.object({ label: z.string(), prompt: z.string() })),
});

export type NextPrompt = z.infer<typeof nextPromptsSchema>["prompts"][number];

/** The pills that stand in until a reply has its own: an empty chat, a running turn, a failed call. */
export const DEFAULT_PROMPTS: readonly NextPrompt[] = [
  { label: "Add a hotel", prompt: "Find the best hotel for this trip and add it to the itinerary" },
  { label: "Add a restaurant", prompt: "Find the best restaurant for the next open meal and add it to the itinerary" },
  { label: "Search restaurants", prompt: "Search restaurants that fit this client for the next open meal" },
  { label: "Search a hotel", prompt: "Search hotels that fit this client" },
  { label: "Search something to do", prompt: "Search something to do that fits this client for the next open part of a day" },
];

/** The pills to show: the reply's own when it has any, else the defaults. */
export const promptsToOffer = (generated: readonly NextPrompt[]) => (generated.length > 0 ? generated : DEFAULT_PROMPTS);

/** A message's last words, so the text before a tool call is left out. */
const lastText = (message: Pick<AppUIMessage, "parts">) => {
  const texts = message.parts.flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text] : []));
  return withoutRegionMarker(texts.at(-1) ?? "").trim();
};

const sameWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The advisor's last message and the words of the reply to it, with the reply's
 * id and what the advisor asked before that. Undefined unless the last visible
 * message is an answer with words in it: a stopped reply has no follow-up.
 */
export function lastExchange(messages: readonly AppUIMessage[]): (LastExchange & { id: string }) | undefined {
  const visible = messages.filter((m) => !m.metadata?.hidden);
  const last = visible.at(-1);
  if (last?.role !== "assistant" || last.metadata?.stopped) return undefined;
  const reply = lastText(last);
  if (!reply) return undefined;
  const asks = visible.filter((m) => m.role === "user").map(lastText);
  return {
    id: last.id,
    ask: shortLine(asks.at(-1) ?? "", MAX_LINE),
    reply: shortLine(reply, MAX_LINE),
    earlier: asks.slice(0, -1).slice(-EARLIER_ASKS).filter(Boolean).map((text) => shortLine(text, EARLIER_LINE)),
  };
}

const oneLine = (text: string) =>
  (text.trim().split("\n")[0] ?? "")
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\.+$/, "")
    .trim();

/**
 * The model's options as pills ready for the composer, at most three. An
 * option is left out when it cannot be offered: a label or message of the
 * wrong length, naming the data provider, repeating what the advisor just
 * asked, or repeating another pill.
 */
export function cleanNextPrompts(options: readonly NextPrompt[], ask = ""): NextPrompt[] {
  const seen = new Set([sameWords(ask)]);
  const kept: NextPrompt[] = [];
  for (const option of options) {
    const label = oneLine(option.label);
    const prompt = oneLine(option.prompt);
    if (label.length < NEXT_LABEL_MIN || label.length > NEXT_LABEL_MAX) continue;
    if (prompt.length < NEXT_PROMPT_MIN || prompt.length > NEXT_PROMPT_MAX) continue;
    if (/qloo/i.test(`${label} ${prompt}`)) continue;
    if (seen.has(sameWords(label)) || seen.has(sameWords(prompt))) continue;
    seen.add(sameWords(label)).add(sameWords(prompt));
    kept.push({ label, prompt });
  }
  return kept.slice(0, NEXT_PROMPT_COUNT);
}
