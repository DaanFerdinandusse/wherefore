"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { lastExchange } from "@/lib/agent/next-prompt";
import type { AppUIMessage } from "@/lib/contracts";

const nextPromptSchema = z.object({ prompt: z.string().nullable() });

/**
 * The message to offer in the composer: asked for once per reply, as soon as
 * its stream ends, and dropped when the transcript moves on. The request is
 * not cancelled when the session flips back to busy to re-read the turn: an
 * answer for an older reply is simply never shown. A failed request offers
 * nothing.
 */
export function useNextPrompt(chatId: string, messages: readonly AppUIMessage[], idle: boolean): string | undefined {
  const exchange = idle ? lastExchange(messages) : undefined;
  const after = exchange?.id;
  const ask = exchange?.ask;
  const reply = exchange?.reply;
  const asked = useRef<string | undefined>(undefined);
  const [loaded, setLoaded] = useState<{ after: string; prompt: string | null } | null>(null);

  useEffect(() => {
    if (!after || !reply || asked.current === after) return;
    asked.current = after;
    fetch(`/api/chats/${encodeURIComponent(chatId)}/next-prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ask: ask ?? "", reply }),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const parsed = nextPromptSchema.safeParse(await response.json());
        if (parsed.success) setLoaded({ after, prompt: parsed.data.prompt });
      })
      .catch(() => {});
  }, [chatId, after, ask, reply]);

  return loaded && loaded.after === after ? (loaded.prompt ?? undefined) : undefined;
}
