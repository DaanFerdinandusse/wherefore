import type { LanguageModelV4Prompt } from "@ai-sdk/provider";
import type { UIMessageChunk } from "ai";
import { describe, expect, it } from "vitest";

import { trimHistory } from "./history";
import { createChatUIChunkTransform, type ChatStreamPart } from "./stream";

async function run(parts: ChatStreamPart[], options: Parameters<typeof createChatUIChunkTransform>[0]) {
  const out: UIMessageChunk[] = [];
  const stream = new ReadableStream<ChatStreamPart>({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    },
  }).pipeThrough(createChatUIChunkTransform(options));
  const reader = stream.getReader();
  for (let next = await reader.read(); !next.done; next = await reader.read()) out.push(next.value);
  return out;
}

const parts: ChatStreamPart[] = [
  { type: "text-start", id: "t" },
  { type: "text-delta", id: "t", text: "Hel" },
  { type: "text-delta", id: "t", text: "lo" },
  { type: "text-end", id: "t" },
  { type: "tool-output-preliminary", toolCallId: "c1", output: { phase: "searching" } },
  { type: "data-tool-progress", id: "c1", data: { n: 1 } },
  { type: "turn-marker", id: "persist:t1" },
  { type: "turn-error", errorText: "Late" },
];

describe("createChatUIChunkTransform", () => {
  it("maps our own parts and frames the stream", async () => {
    const out = await run(parts, { messageId: "a-t1" });
    expect(out.map((c) => c.type)).toEqual([
      "start",
      "start-step",
      "text-start",
      "text-delta",
      "text-delta",
      "text-end",
      "tool-output-available",
      "data-tool-progress",
      "error",
      "finish-step",
      "finish",
    ]);
    expect(out[0]).toEqual({ type: "start", messageId: "a-t1" });
    expect(out[6]).toEqual({ type: "tool-output-available", toolCallId: "c1", output: { phase: "searching" }, preliminary: true });
  });

  it("resumes at a UI chunk index with nothing repeated", async () => {
    const full = await run(parts, {});
    for (let i = 0; i <= full.length; i++) {
      const resumed = await run(parts, { uiStartIndex: i });
      expect([...full.slice(0, i), ...resumed]).toEqual(full);
    }
  });

  it("ends at the persist marker", async () => {
    const out = await run(parts, { untilMarker: "persist:t1" });
    expect(out.map((c) => c.type).slice(-3)).toEqual(["data-tool-progress", "finish-step", "finish"]);
  });
});

describe("trimHistory", () => {
  const big = { big: "x".repeat(3_000) };
  const toolTurn = (n: number): LanguageModelV4Prompt => [
    { role: "user", content: [{ type: "text", text: `q${n}` }] },
    { role: "assistant", content: [{ type: "tool-call", toolCallId: `c${n}`, toolName: "t", input: {} }] },
    { role: "tool", content: [{ type: "tool-result", toolCallId: `c${n}`, toolName: "t", output: { type: "json", value: big } }] },
    { role: "assistant", content: [{ type: "text", text: `a${n}` }] },
  ];
  const prompt: LanguageModelV4Prompt = [
    { role: "system", content: "sys" },
    ...Array.from({ length: 10 }, (_, i) => toolTurn(i)).flat(),
  ];

  it("cuts only before a user message and keeps the system prompt", () => {
    const out = trimHistory(prompt, { maxMessages: 10 });
    expect(out[0]?.role).toBe("system");
    expect(out[1]?.role).toBe("user");
    expect(out.length).toBeLessThanOrEqual(11);
    // Every kept tool call has its result.
    const calls = out.flatMap((m) => (m.role === "assistant" ? m.content.filter((p) => p.type === "tool-call") : []));
    const results = out.flatMap((m) => (m.role === "tool" ? m.content : []));
    expect(calls.map((c) => ("toolCallId" in c ? c.toolCallId : ""))).toEqual(
      results.map((r) => ("toolCallId" in r ? r.toolCallId : "")),
    );
  });

  it("stubs large old tool outputs but keeps the recent ones", () => {
    const out = trimHistory(prompt, { maxMessages: 100, keepFullSteps: 3 });
    const outputs = out.flatMap((m) => (m.role === "tool" ? m.content : []));
    const stubbed = outputs.filter((r) => r.type === "tool-result" && JSON.stringify(r.output).includes("omitted"));
    expect(stubbed.length).toBeGreaterThan(0);
    const last = outputs.at(-1);
    expect(last && last.type === "tool-result" ? JSON.stringify(last.output) : "").toContain("xxx");
  });
});
