import type { LanguageModelV4Prompt } from "@ai-sdk/provider";
import type { ModelMessage } from "ai";

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

// The history a turn starts from (toModelHistory) has a total budget, so a
// long chat never sends every old tool result again. Over budget, the oldest
// tool outputs go first (each becomes a short stub; the call and its result
// stay paired), then the oldest whole exchanges (the cut lands right before a
// user message). The last user message always stays. Rough size: 4 chars a
// token, which is close enough for a budget.

export const HISTORY_TOKEN_BUDGET = 24_000;
export const OMITTED_OUTPUT_NOTE = "Older result omitted to keep the chat short. Call the tool again if you need it.";

type ToolMessage = Extract<ModelMessage, { role: "tool" }>;

export function estimateTokens(value: unknown): number {
  try {
    return Math.ceil((JSON.stringify(value)?.length ?? 0) / 4);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function stubbedTool(message: ToolMessage): ToolMessage {
  return {
    ...message,
    content: message.content.map((part) =>
      part.type === "tool-result" ? { ...part, output: { type: "text" as const, value: OMITTED_OUTPUT_NOTE } } : part,
    ),
  };
}

function isStubbed(message: ToolMessage): boolean {
  return message.content.every(
    (part) => part.type !== "tool-result" || (part.output.type === "text" && part.output.value === OMITTED_OUTPUT_NOTE),
  );
}

/** The history cut to `maxTokens`: oldest tool outputs first, then oldest exchanges. Pure. */
export function budgetHistory(messages: ModelMessage[], maxTokens = HISTORY_TOKEN_BUDGET): ModelMessage[] {
  const sizes = messages.map(estimateTokens);
  let total = sizes.reduce((sum, n) => sum + n, 0);
  if (total <= maxTokens) return messages;

  const out = [...messages];
  for (let i = 0; i < out.length && total > maxTokens; i++) {
    const message = out[i];
    if (!message || message.role !== "tool" || isStubbed(message)) continue;
    const stub = stubbedTool(message);
    const size = estimateTokens(stub);
    total -= (sizes[i] ?? 0) - size;
    sizes[i] = size;
    out[i] = stub;
  }
  if (total <= maxTokens) return out;

  // Still over: drop whole exchanges from the front, cutting before a user
  // message, never past the last one.
  const lastUser = out.findLastIndex((m) => m.role === "user");
  let cut = 0;
  for (let i = 1; i <= lastUser && total > maxTokens; i++) {
    if (out[i]?.role !== "user") continue;
    for (let j = cut; j < i; j++) total -= sizes[j] ?? 0;
    cut = i;
  }
  return out.slice(cut);
}
