import type { LanguageModelV4Prompt } from "@ai-sdk/provider";

// prepareStep's history trim (PLAN 6.2). Two rules keep a stateless Codex
// call valid:
//   1. Never separate a tool call from its result: the cut only lands right
//      before a user message, so every assistant tool call keeps the tool
//      message that answers it (and its encrypted reasoning).
//   2. Large tool outputs older than the last few steps are replaced by a
//      short stub that keeps the call id and tool name, so the pairing holds.
// Pure, runs in the workflow body.

export const MAX_HISTORY_MESSAGES = 30;
export const KEEP_FULL_OUTPUT_STEPS = 3;
export const LARGE_OUTPUT_CHARS = 2_000;

type Message = LanguageModelV4Prompt[number];

function cutIndex(messages: Message[], max: number): number {
  if (messages.length <= max) return 0;
  for (let i = messages.length - max; i < messages.length; i++) {
    if (messages[i]?.role === "user") return i;
  }
  // No safe boundary inside the window (one long tool loop): keep everything.
  return 0;
}

function outputSize(output: unknown): number {
  try {
    return JSON.stringify(output)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function trimHistory(
  prompt: LanguageModelV4Prompt,
  {
    maxMessages = MAX_HISTORY_MESSAGES,
    keepFullSteps = KEEP_FULL_OUTPUT_STEPS,
    largeChars = LARGE_OUTPUT_CHARS,
  }: { maxMessages?: number; keepFullSteps?: number; largeChars?: number } = {},
): LanguageModelV4Prompt {
  const system = prompt.filter((m) => m.role === "system");
  const rest = prompt.filter((m) => m.role !== "system");
  const kept = rest.slice(cutIndex(rest, maxMessages));

  // Index of the assistant message that starts the protected tail.
  let seen = 0;
  let protectFrom = 0;
  for (let i = kept.length - 1; i >= 0; i--) {
    if (kept[i]?.role === "assistant" && ++seen === keepFullSteps) {
      protectFrom = i;
      break;
    }
  }
  if (seen < keepFullSteps) protectFrom = 0;

  const stubbed = kept.map((message, index): Message => {
    if (message.role !== "tool" || index >= protectFrom) return message;
    return {
      ...message,
      content: message.content.map((part) => {
        if (part.type !== "tool-result" || outputSize(part.output) <= largeChars) return part;
        return {
          ...part,
          output: {
            type: "json" as const,
            value: { omitted: true, note: "Older large result trimmed. Call the tool again if you need it." },
          },
        };
      }),
    };
  });

  return [...system, ...stubbed];
}
