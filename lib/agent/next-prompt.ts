import { z } from "zod";

import type { AppUIMessage } from "@/lib/contracts";
import { withoutRegionMarker } from "@/lib/map/region-prompt";

import { shortLine } from "./chat-title";

// The message the composer offers after a reply: one line the advisor can take
// with Tab. This file is the pure part, safe on the client: which exchange a
// follow-up builds on and what is kept of the model's answer. The model call
// lives in next-prompt-data.ts, apart from the turn's workflow.

export const NEXT_PROMPT_MIN = 8;
export const NEXT_PROMPT_MAX = 80;
const MAX_LINE = 600;

/** What the client sends: the two lines the model reads. */
export const lastExchangeSchema = z.object({
  ask: z.string().max(MAX_LINE + 1),
  reply: z.string().min(1).max(MAX_LINE + 1),
});

export type LastExchange = z.infer<typeof lastExchangeSchema>;

/** A message's last words, so the text before a tool call is left out. */
const lastText = (message: Pick<AppUIMessage, "parts">) => {
  const texts = message.parts.flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text] : []));
  return withoutRegionMarker(texts.at(-1) ?? "").trim();
};

const sameWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * The advisor's last message and the words of the reply to it, with the reply's
 * id. Undefined unless the last visible message is an answer with words in it:
 * a stopped reply has no follow-up.
 */
export function lastExchange(messages: readonly AppUIMessage[]): (LastExchange & { id: string }) | undefined {
  const visible = messages.filter((m) => !m.metadata?.hidden);
  const last = visible.at(-1);
  if (last?.role !== "assistant" || last.metadata?.stopped) return undefined;
  const reply = lastText(last);
  if (!reply) return undefined;
  const ask = visible.findLast((m) => m.role === "user");
  return { id: last.id, ask: ask ? shortLine(lastText(ask), MAX_LINE) : "", reply: shortLine(reply, MAX_LINE) };
}

/**
 * The model's reply as one line ready for the composer, or null when it cannot
 * be offered: too short, too long, naming the data provider, or what the
 * advisor just asked.
 */
export function cleanNextPrompt(reply: string, ask = ""): string | null {
  const text = (reply.trim().split("\n")[0] ?? "")
    .replace(/^["'“‘]+|["'”’]+$/g, "")
    .replace(/\s*[\u2014\u2013]\s*/g, ", ")
    .replace(/\.+$/, "")
    .trim();
  if (text.length < NEXT_PROMPT_MIN || text.length > NEXT_PROMPT_MAX) return null;
  if (/qloo/i.test(text)) return null;
  return sameWords(ask) === sameWords(text) ? null : text;
}
