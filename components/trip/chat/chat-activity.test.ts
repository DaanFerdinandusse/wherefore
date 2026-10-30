import { describe, expect, it } from "vitest";
import { readUIMessageStream } from "ai";
import type { AppUIMessage } from "@/lib/contracts";
import { createChatUIChunkTransform, type ChatStreamPart } from "@/lib/agent/stream";
import { chatActivity, thinkingLabel } from "./chat-activity";

const assistant = (parts: AppUIMessage["parts"]): AppUIMessage => ({ id: "reply", role: "assistant", parts });
const reasoning = { type: "reasoning", text: "**Comparing dinner options**\n\nChecking the favorites.", state: "streaming" } as const;

describe("chat activity feedback", () => {
  it("distinguishes initial waiting from actual reasoning", () => {
    expect(chatActivity([], true)?.kind).toBe("preparing");
    expect(chatActivity([assistant([])], true)?.label).toBe("Preparing response");
    expect(chatActivity([assistant([{ ...reasoning, text: "" }])], true)?.label).toBe("Thinking");
    expect(chatActivity([assistant([reasoning])], true)?.label).toBe("Comparing dinner options");
  });

  it("suppresses thinking during tools, including preliminary search output and quiet tools", () => {
    const tools: AppUIMessage["parts"] = [
      { type: "dynamic-tool", toolName: "find_places", toolCallId: "s", state: "input-streaming", input: {} },
      { type: "dynamic-tool", toolName: "find_places", toolCallId: "s", state: "input-available", input: {} },
      { type: "dynamic-tool", toolName: "find_places", toolCallId: "s", state: "output-available", input: {}, output: {}, preliminary: true },
      { type: "dynamic-tool", toolName: "get_trip_context", toolCallId: "c", state: "input-available", input: {} },
    ];
    for (const tool of tools) expect(chatActivity([assistant([reasoning, tool])], true)).toBeNull();
  });

  it("returns for the next reasoning event, but not merely because a tool finished", () => {
    const tool = { type: "dynamic-tool", toolName: "find_places", toolCallId: "s", state: "output-available", input: {}, output: {} } as const;
    expect(chatActivity([assistant([tool])], true)).toBeNull();
    expect(chatActivity([assistant([tool, reasoning])], true)?.kind).toBe("thinking");
    expect(chatActivity([assistant([reasoning, { type: "text", text: "Here are the options.", state: "streaming" }])], true)).toBeNull();
  });

  it("ends on reasoning-end, completion, failure or stop, and ignores hidden history", () => {
    expect(chatActivity([assistant([{ ...reasoning, state: "done" }])], true)).toBeNull();
    expect(chatActivity([assistant([reasoning])], false)).toBeNull();
    expect(chatActivity([{ ...assistant([reasoning]), metadata: { hidden: true } }], true)?.kind).toBe("preparing");
  });

  it("follows actual reasoning chunks through the durable stream and UI reducer", async () => {
    const events: ChatStreamPart[] = [
      { type: "reasoning-start", id: "r" },
      { type: "reasoning-delta", id: "r", text: "**Comparing dinner options**" },
      { type: "reasoning-end", id: "r" },
      { type: "reasoning-start", id: "r2" },
      { type: "reasoning-delta", id: "r2", text: "**Checking the shortlist**" },
      { type: "reasoning-end", id: "r2" },
    ];
    const stream = new ReadableStream<ChatStreamPart>({ start(controller) {
      for (const event of events) controller.enqueue(event);
      controller.close();
    } }).pipeThrough(createChatUIChunkTransform({ messageId: "reply" }));
    const labels = [];
    for await (const message of readUIMessageStream<AppUIMessage>({ stream })) {
      labels.push(chatActivity([message], true)?.label ?? null);
    }
    expect(labels).toContain("Thinking");
    expect(labels).toContain("Comparing dinner options");
    expect(labels).toContain("Checking the shortlist");
    expect(labels.at(-1)).toBeNull();
  });
});

describe("summary labels", () => {
  it("tracks the newest completed heading without inventing a description", () => {
    expect(thinkingLabel("**Reading favorites**\n\nDetails.\n\n**Comparing places**\n\nMore details.")).toBe("Comparing places");
    expect(thinkingLabel("**Reading favorites**\n\n**Comparing")).toBe("Reading favorites");
    expect(thinkingLabel("First paragraph.\n\nChecking the shortlist.")).toBe("Checking the shortlist.");
    expect(thinkingLabel("## Comparing places\nDetails")).toBe("Comparing places");
    expect(thinkingLabel("Checking ".repeat(30)).length).toBeLessThanOrEqual(110);
  });
});
