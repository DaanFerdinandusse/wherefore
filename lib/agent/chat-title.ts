import type { AppUIMessage } from "@/lib/contracts";

// A chat's title is the advisor's first message, cut to a short line on a
// word boundary. Pure: chat-store writes it in the statement that takes the
// first turn's lock (only when the chat has no title yet).

export const CHAT_TITLE_MAX = 60;

/** The text of a user message, whitespace collapsed. */
function messageText(message: Pick<AppUIMessage, "parts">): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/** `text` cut to at most `max` characters on a word boundary, with an ellipsis when cut. */
export function shortLine(text: string, max = CHAT_TITLE_MAX): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, max);
  const space = head.lastIndexOf(" ");
  // One long word: cut it rather than leave nothing.
  const cut = space >= max / 3 ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,.;:!?-]+$/, "")}…`;
}

/**
 * The title a chat takes from this message, or null when the message cannot
 * name the chat (a hidden message, such as a seed brief, or no text).
 */
export function chatTitleFrom(message: Pick<AppUIMessage, "role" | "parts" | "metadata">): string | null {
  if (message.role !== "user" || message.metadata?.hidden) return null;
  const title = shortLine(messageText(message));
  return title || null;
}
