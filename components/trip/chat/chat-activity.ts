import type { AppUIMessage } from "@/lib/contracts";

/** Keep feedback present before the first delta and between model/tool steps. */
export function needsThinkingIndicator(messages: AppUIMessage[], streaming: boolean): boolean {
  if (!streaming) return false;
  const last = messages.filter((message) => !message.metadata?.hidden).at(-1);
  if (last?.role !== "assistant") return true;
  return !last.parts.some((part) =>
    (part.type === "text" || part.type === "reasoning") &&
    part.state === "streaming" && Boolean(part.text.trim()),
  );
}
