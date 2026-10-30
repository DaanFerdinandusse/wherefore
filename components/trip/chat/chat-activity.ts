import { isToolUIPart } from "ai";
import type { AppUIMessage } from "@/lib/contracts";

export type ChatActivity = {
  key: string;
  kind: "preparing" | "thinking";
  label: string;
  summary: string;
};

/** Use the latest complete summary heading, or its latest paragraph, without inventing copy. */
export function thinkingLabel(summary: string): string {
  const headings = Array.from(summary.matchAll(/(?:\*\*([^*\n]+)\*\*|^#{1,6}\s+([^\n]+))/gm));
  const heading = headings.at(-1);
  const paragraph = summary.trim().split(/\n\s*\n/).at(-1) ?? "";
  const text = (heading?.[1] ?? heading?.[2] ?? paragraph)
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Thinking";
  if (text.length <= 110) return text;
  const prefix = text.slice(0, 107);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > 70 ? boundary : prefix.length)}...`;
}

/** Reasoning start/delta/end drive thinking. A busy transport alone is not reasoning. */
export function chatActivity(messages: AppUIMessage[], streaming: boolean): ChatActivity | null {
  if (!streaming) return null;
  const last = messages.findLast((message) => !message.metadata?.hidden);
  const preparing: ChatActivity = { key: last?.id ?? "pending", kind: "preparing", label: "Preparing response", summary: "" };
  if (last?.role !== "assistant") return preparing;
  // Includes partial arguments, quiet tools and preliminary search results.
  if (last.parts.some((part) => isToolUIPart(part) && (
    part.state === "input-streaming" || part.state === "input-available" ||
    part.state === "approval-requested" || part.state === "approval-responded" ||
    (part.state === "output-available" && part.preliminary === true)
  ))) return null;

  const index = last.parts.findLastIndex((part) => part.type === "reasoning" || part.type === "text" || isToolUIPart(part));
  if (index < 0) return preparing;
  const part = last.parts[index];
  if (part.type !== "reasoning" || part.state !== "streaming") return null;
  return { key: `${last.id}-${index}`, kind: "thinking", label: thinkingLabel(part.text), summary: part.text };
}
