import type { LanguageModelV4StreamPart, LanguageModelV4Usage } from "@ai-sdk/provider";
import { WorkflowAgent } from "@ai-sdk/workflow";
import { isLoopFinished, readUIMessageStream, tool } from "ai";
import { MockLanguageModelV4, convertArrayToReadableStream } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import type { AppUIMessage } from "@/lib/contracts";

import {
  finalizeTurnMessage,
  INTERRUPTED_TOOL_ERROR,
  interruptedOutputOf,
  projectTurnMessage,
  STOPPED_TOOL_ERROR,
  toModelHistory,
} from "./messages";
import { createChatUIChunkTransform, messageToUIChunks, type ChatStreamPart } from "./stream";

// Spike item 3: does the ModelMessage[] projection match what the live stream
// renders? Runs a real WorkflowAgent loop (outside a workflow, steps run
// inline) on a mock model: reasoning with encrypted metadata, a tool call,
// then text. Then compares projectTurnMessage(result.messages) with
// readUIMessageStream over the same run's parts through our transform.

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};
const enc = { openai: { itemId: "rs_1", reasoningEncryptedContent: "gAAA-secret" } };

function streamOf(parts: LanguageModelV4StreamPart[]) {
  return { stream: convertArrayToReadableStream(parts) };
}

async function runTurn() {
  const model = new MockLanguageModelV4({
    doStream: [
      streamOf([
        { type: "stream-start", warnings: [] },
        { type: "reasoning-start", id: "rs_1:0", providerMetadata: enc },
        { type: "reasoning-delta", id: "rs_1:0", delta: "Thinking" },
        { type: "reasoning-end", id: "rs_1:0", providerMetadata: enc },
        { type: "tool-call", toolCallId: "call_1", toolName: "lookup", input: '{"q":"wine"}', providerMetadata: { openai: { itemId: "fc_1" } } },
        { type: "finish", usage, finishReason: { unified: "tool-calls", raw: "tool_calls" } },
      ]),
      streamOf([
        { type: "stream-start", warnings: [] },
        { type: "text-start", id: "msg_1", providerMetadata: { openai: { itemId: "msg_1" } } },
        { type: "text-delta", id: "msg_1", delta: "Found " },
        { type: "text-delta", id: "msg_1", delta: "two." },
        { type: "text-end", id: "msg_1", providerMetadata: { openai: { itemId: "msg_1" } } },
        { type: "finish", usage, finishReason: { unified: "stop", raw: "stop" } },
      ]),
    ],
  });

  const parts: ChatStreamPart[] = [];
  const writable = new WritableStream<ChatStreamPart>({ write: (p) => void parts.push(p) });
  const agent = new WorkflowAgent({
    model,
    instructions: "test",
    tools: {
      lookup: tool({
        description: "Look up",
        inputSchema: z.object({ q: z.string() }),
        execute: async ({ q }) => ({ found: 2, q }),
      }),
    },
    stopWhen: [isLoopFinished()],
  });
  const result = await agent.stream({
    messages: [{ role: "user", content: "find wine" }],
    writable,
    sendFinish: false,
  });
  return { parts, result };
}

async function readParts(parts: ChatStreamPart[], id: string): Promise<AppUIMessage | undefined> {
  const stream = new ReadableStream<ChatStreamPart>({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    },
  }).pipeThrough(createChatUIChunkTransform({ messageId: id }));
  let last: AppUIMessage | undefined;
  for await (const m of readUIMessageStream<AppUIMessage>({ stream })) last = m;
  return last;
}

describe("turn message projection vs stream read", () => {
  it("builds the same assistant message from both sources", async () => {
    const { parts, result } = await runTurn();
    const meta = { turnId: "t1", kind: "turn" as const };

    const fromStream = await readParts(parts, "a-t1");
    expect(fromStream).toBeDefined();
    const streamed = finalizeTurnMessage(fromStream!, meta);
    // Only the turn's own response messages, not the input user message.
    const projected = projectTurnMessage(result.messages.slice(1), { id: "a-t1", metadata: meta });

    expect(projected).toMatchSnapshot("projected");
    expect(streamed).toMatchSnapshot("streamed");

    // The parts the next stateless call depends on agree exactly.
    const essentials = (m: AppUIMessage) =>
      m.parts.map((p) => {
        if (p.type === "text" || p.type === "reasoning") return { type: p.type, text: p.text, meta: p.providerMetadata };
        if (p.type.startsWith("tool-") && "toolCallId" in p) {
          return { type: p.type, id: p.toolCallId, state: p.state, input: p.input, output: "output" in p ? p.output : undefined };
        }
        return { type: p.type };
      });
    expect(essentials(projected)).toEqual(essentials(streamed));
  });

  it("round-trips to model history with the encrypted reasoning and the paired tool result", async () => {
    const { parts } = await runTurn();
    const message = finalizeTurnMessage((await readParts(parts, "a-t1"))!, { turnId: "t1" });
    const history = await toModelHistory([
      { id: "u1", role: "user", parts: [{ type: "text", text: "find wine" }] },
      message,
    ]);
    const roles = history.map((m) => m.role);
    expect(roles).toEqual(["user", "assistant", "tool", "assistant"]);
    const firstAssistant = history[1];
    expect(firstAssistant?.role === "assistant" && Array.isArray(firstAssistant.content)).toBe(true);
    const content = firstAssistant?.role === "assistant" && Array.isArray(firstAssistant.content) ? firstAssistant.content : [];
    const reasoning = content.find((p) => p.type === "reasoning");
    expect(reasoning?.providerOptions).toMatchObject({ openai: { reasoningEncryptedContent: "gAAA-secret" } });
    const call = content.find((p) => p.type === "tool-call");
    const toolMessage = history[2];
    const result = toolMessage?.role === "tool" ? toolMessage.content[0] : undefined;
    expect(call && "toolCallId" in call ? call.toolCallId : undefined).toBe("call_1");
    expect(result && "toolCallId" in result ? result.toolCallId : undefined).toBe("call_1");
  });
});

describe("finalizeTurnMessage", () => {
  it("settles unfinished tools, drops preliminary flags and empty text, marks stopped", () => {
    const message: AppUIMessage = {
      id: "a-t2",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "text", text: "Partial", state: "streaming" },
        { type: "text", text: "", state: "streaming" },
        { type: "tool-slow_count", toolCallId: "c1", state: "input-available", input: { to: 10 } },
        { type: "tool-echo_places", toolCallId: "c2", state: "output-available", input: {}, output: { n: 1 }, preliminary: true },
        { type: "step-start" },
      ],
    };
    const out = finalizeTurnMessage(message, { turnId: "t2", stopped: true });
    expect(out.parts).toEqual([
      { type: "step-start" },
      { type: "text", text: "Partial", state: "done" },
      { type: "tool-slow_count", toolCallId: "c1", state: "output-error", input: { to: 10 }, errorText: STOPPED_TOOL_ERROR },
      {
        type: "tool-echo_places",
        toolCallId: "c2",
        state: "output-error",
        input: {},
        errorText: INTERRUPTED_TOOL_ERROR,
        interruptedOutput: { n: 1 },
      },
    ]);
    expect(out.metadata).toEqual({ turnId: "t2", stopped: true });
    expect(interruptedOutputOf(out.parts[3]!)).toEqual({ n: 1 });
  });

  it("keeps a final tool output as is, and is idempotent on an interrupted part", () => {
    const message: AppUIMessage = {
      id: "a-t3",
      role: "assistant",
      parts: [
        { type: "tool-echo_places", toolCallId: "c1", state: "output-available", input: {}, output: { n: 3 } },
        { type: "tool-slow_count", toolCallId: "c2", state: "output-available", input: {}, output: { at: 2 }, preliminary: true },
      ],
    };
    const once = finalizeTurnMessage(message, { turnId: "t3" });
    expect(once.parts[0]).toEqual({ type: "tool-echo_places", toolCallId: "c1", state: "output-available", input: {}, output: { n: 3 } });
    expect(once.parts[1]).toMatchObject({ state: "output-error", errorText: INTERRUPTED_TOOL_ERROR, interruptedOutput: { at: 2 } });
    expect(finalizeTurnMessage(once, { turnId: "t3" }).parts).toEqual(once.parts);
  });

  it("the model history sees an interrupted tool as an error, never its partial output", async () => {
    const message = finalizeTurnMessage(
      {
        id: "a-t4",
        role: "assistant",
        parts: [
          { type: "step-start" },
          { type: "tool-slow_count", toolCallId: "c9", state: "output-available", input: { to: 5 }, output: { at: 2 }, preliminary: true },
        ],
      },
      { turnId: "t4" },
    );
    const history = await toModelHistory([{ id: "u4", role: "user", parts: [{ type: "text", text: "count" }] }, message]);
    const toolMessage = history.find((m) => m.role === "tool");
    const result = toolMessage?.role === "tool" ? toolMessage.content[0] : undefined;
    expect(result && "output" in result ? result.output : undefined).toEqual({ type: "error-text", value: INTERRUPTED_TOOL_ERROR });
    expect(JSON.stringify(history)).not.toContain('"at":2');
  });
});

describe("messageToUIChunks", () => {
  it("replays a saved message into the same message through the UI stream reader", async () => {
    const { parts } = await runTurn();
    const saved = finalizeTurnMessage((await readParts(parts, "a-t1"))!, { turnId: "t1", kind: "turn" });
    const chunks = messageToUIChunks(saved, { messageId: "a-t1", metadata: { turnId: "t1", kind: "turn" } });
    const stream = new ReadableStream({
      start(c) {
        for (const chunk of chunks) c.enqueue(chunk);
        c.close();
      },
    });
    let replayed: AppUIMessage | undefined;
    for await (const m of readUIMessageStream<AppUIMessage>({ stream })) replayed = m;
    const again = finalizeTurnMessage(replayed!, { turnId: "t1", kind: "turn" });
    const shape = (m: AppUIMessage) =>
      m.parts.map((p) => ({
        type: p.type,
        ...("text" in p ? { text: p.text } : {}),
        ...("state" in p ? { state: p.state } : {}),
        ...("output" in p ? { output: p.output } : {}),
      }));
    expect(again.id).toBe("a-t1");
    expect(shape(again)).toEqual(shape(saved));
  });

  it("is a bare start and finish without a saved message, with the error when given", () => {
    const chunks = messageToUIChunks(undefined, { messageId: "a-x", errorText: "Failed." });
    expect(chunks.map((c) => c.type)).toEqual(["start", "start-step", "error", "finish-step", "finish"]);
  });
});
