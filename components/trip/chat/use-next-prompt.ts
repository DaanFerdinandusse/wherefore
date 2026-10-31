"use client";

import { useEffect, useRef, useState } from "react";

import { lastExchange, nextPromptsSchema, type NextPrompt } from "@/lib/agent/next-prompt";
import type { AppUIMessage } from "@/lib/contracts";

/**
 * The pills to offer above the composer: asked for once per reply, as soon as
 * its stream ends, and dropped when the transcript moves on. The request is
 * not cancelled when the session flips back to busy to re-read the turn: an
 * answer for an older reply is simply never shown. A failed request offers
 * nothing.
 */
export function useNextPrompts(chatId: string, messages: readonly AppUIMessage[], idle: boolean): readonly NextPrompt[] {
  const exchange = idle ? lastExchange(messages) : undefined;
  const after = exchange?.id;
  const body = exchange && JSON.stringify({ ask: exchange.ask, reply: exchange.reply, earlier: exchange.earlier });
  const asked = useRef<string | undefined>(undefined);
  const [loaded, setLoaded] = useState<{ after: string; prompts: NextPrompt[] } | null>(null);

  useEffect(() => {
    if (!after || !body || asked.current === after) return;
    asked.current = after;
    fetch(`/api/chats/${encodeURIComponent(chatId)}/next-prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = nextPromptsSchema.safeParse(await response.json());
        if (parsed.success) setLoaded({ after, prompts: parsed.data.prompts });
      })
      .catch(() => {});
  }, [chatId, after, body]);

  return loaded && loaded.after === after ? loaded.prompts : [];
}
