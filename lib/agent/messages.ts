import {
  convertToModelMessages,
  isToolUIPart,
  type ModelMessage,
  type ProviderMetadata,
  type ToolResultPart,
} from "ai";

import type { AppUIMessage, ChatMessageMetadata } from "@/lib/contracts";

// The transcript in both directions:
//
//   finalizeTurnMessage: the assistant message read back from the run's
//     stream (what the client rendered) made safe to store and to replay.
//   projectTurnMessage: the same message built from WorkflowAgent's
//     ModelMessage[] result. Kept and tested against the stream read; the
//     stream read is what persistTurn stores, because an aborted model step
//     never reaches result.messages (do-stream-step returns { aborted: true }
//     and drops its partial text), while the stream has every delta.
//   toModelHistory: stored UIMessage[] to the ModelMessage[] the next turn
//     sends. Codex is stateless, so this must keep reasoning parts with their
//     provider metadata (encrypted content) and every tool call paired with
//     its result.
//
// Pure, tested in messages.test.ts.

type Part = AppUIMessage["parts"][number];

export const STOPPED_TOOL_ERROR = "Stopped before this step finished.";

function cleanMetadata(metadata: ProviderMetadata | undefined): ProviderMetadata | undefined {
  return metadata && Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Settles every part so the stored message is final and replayable:
 * unfinished tool calls become output-error (a stop or crash mid-tool),
 * preliminary flags go, streaming states become done, empty texts go.
 */
export function finalizeTurnMessage(
  message: AppUIMessage,
  metadata: ChatMessageMetadata,
): AppUIMessage {
  const parts: Part[] = [];
  for (const part of message.parts) {
    if (part.type === "text") {
      if (part.text.length === 0) continue;
      parts.push({ ...part, state: "done" });
      continue;
    }
    if (part.type === "reasoning") {
      parts.push({ ...part, state: "done" });
      continue;
    }
    if (isToolUIPart(part)) {
      if (part.state === "output-available") {
        const settled = { ...part };
        delete settled.preliminary;
        parts.push(settled);
      } else if (part.state === "output-error") {
        // An abort surfaces as a raw "Aborted: This operation was aborted".
        const aborted = metadata.stopped === true && /abort/i.test(part.errorText);
        parts.push(aborted ? { ...part, errorText: STOPPED_TOOL_ERROR } : part);
      } else if (part.state === "output-denied") {
        parts.push(part);
      } else {
        parts.push({
          ...part,
          state: "output-error",
          input: part.input,
          errorText: STOPPED_TOOL_ERROR,
        } as Part);
      }
      continue;
    }
    parts.push(part);
  }
  // Drop trailing step-starts that opened a step nothing was written into.
  while (parts.at(-1)?.type === "step-start") parts.pop();
  return { ...message, role: "assistant", parts, metadata: { ...message.metadata, ...metadata } };
}

/** True when a finalized message has something worth storing. */
export function hasContent(message: AppUIMessage): boolean {
  return message.parts.some((p) => p.type === "text" || isToolUIPart(p));
}

function toolOutput(result: ToolResultPart | undefined): { ok: true; value: unknown } | { ok: false; error: string } | undefined {
  if (!result) return undefined;
  const output = result.output;
  switch (output.type) {
    case "json":
    case "text":
      return { ok: true, value: output.value };
    case "error-text":
      return { ok: false, error: output.value };
    case "error-json":
      return { ok: false, error: JSON.stringify(output.value) };
    case "execution-denied":
      return { ok: false, error: output.reason ?? "Denied" };
    default:
      return { ok: true, value: output };
  }
}

/**
 * Builds the turn's assistant UIMessage from the agent's response messages
 * (one assistant ModelMessage per model step, each followed by its tool
 * message). Mirrors what readUIMessageStream builds from the live stream.
 */
export function projectTurnMessage(
  responseMessages: ModelMessage[],
  { id, metadata }: { id: string; metadata: ChatMessageMetadata },
): AppUIMessage {
  const results = new Map<string, ToolResultPart>();
  for (const message of responseMessages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) if (part.type === "tool-result") results.set(part.toolCallId, part);
  }

  const parts: Part[] = [];
  for (const message of responseMessages) {
    if (message.role !== "assistant") continue;
    parts.push({ type: "step-start" });
    const content = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : message.content;
    for (const part of content) {
      if (part.type === "text") {
        if (!part.text) continue;
        const providerMetadata = cleanMetadata(part.providerOptions as ProviderMetadata | undefined);
        parts.push({ type: "text", text: part.text, state: "done", ...(providerMetadata ? { providerMetadata } : {}) });
      } else if (part.type === "reasoning") {
        const providerMetadata = cleanMetadata(part.providerOptions as ProviderMetadata | undefined);
        parts.push({ type: "reasoning", text: part.text, state: "done", ...(providerMetadata ? { providerMetadata } : {}) });
      } else if (part.type === "tool-call") {
        const callProviderMetadata = cleanMetadata(part.providerOptions as ProviderMetadata | undefined);
        const settled = toolOutput(results.get(part.toolCallId));
        const base = {
          type: `tool-${part.toolName}` as const,
          toolCallId: part.toolCallId,
          input: part.input,
          ...(callProviderMetadata ? { callProviderMetadata } : {}),
        };
        parts.push(
          (settled === undefined
            ? { ...base, state: "output-error", errorText: STOPPED_TOOL_ERROR }
            : settled.ok
              ? { ...base, state: "output-available", output: settled.value }
              : { ...base, state: "output-error", errorText: settled.error }) as Part,
        );
      }
    }
  }
  while (parts.at(-1)?.type === "step-start") parts.pop();
  return { id, role: "assistant", parts, metadata };
}

/**
 * The model history for the next turn. Unsettled tool parts (a crash before
 * persistTurn finalized them) are settled first, so a call never goes out
 * without its result.
 */
export async function toModelHistory(messages: AppUIMessage[]): Promise<ModelMessage[]> {
  const settled = messages.map((m) => (m.role === "assistant" ? finalizeTurnMessage(m, m.metadata ?? {}) : m));
  return convertToModelMessages(settled, {
    // Data parts are UI only; the model never sees them.
    convertDataPart: () => undefined,
  });
}
