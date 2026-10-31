import { describe, expect, it } from "vitest";
import { readUIMessageStream } from "ai";
import type { AppUIMessage } from "@/lib/contracts";
import { createChatUIChunkTransform, type ChatStreamPart } from "@/lib/agent/stream";
import { chatActivity, thinkingLabel } from "./chat-activity";

const assistant = (parts: AppUIMessage["parts"]): AppUIMessage => ({ id: "reply", role: "assistant", parts });
const reasoning = { type: "reasoning", text: "**Comparing dinner options**\n\nChecking the favorites.", state: "streaming" } as const;
const tool = (toolName: string, state: "input-streaming" | "input-available" | "output-available", output: unknown = {}, preliminary?: boolean): AppUIMessage["parts"][number] =>
  (state === "output-available"
    ? { type: "dynamic-tool", toolName, toolCallId: toolName, state, input: {}, output, ...(preliminary ? { preliminary } : {}) }
    : { type: "dynamic-tool", toolName, toolCallId: toolName, state, input: {} }) as AppUIMessage["parts"][number];
const nomada = { tripPlaceId: "t1", placeId: "p1", name: "Nómada", category: "eat" };
const search = (extra: object) => ({ phase: "done", label: "Searched", places: [nomada], ...extra });
const step: AppUIMessage["parts"][number] = { type: "step-start" };

describe("chat activity feedback", () => {
  it("names the client while the first model call runs", () => {
    expect(chatActivity([], true, "Ana Ferreira")?.label).toBe("Thinking about what Ana would love");
    expect(chatActivity([assistant([step])], true, "Ana Ferreira")?.kind).toBe("preparing");
    expect(chatActivity([assistant([])], true)?.label).toBe("Thinking about what would fit");
  });

  it("prefers the model's own summary, and says what the turn waits on when it has none", () => {
    expect(chatActivity([assistant([reasoning])], true)?.label).toBe("Comparing dinner options");
    expect(chatActivity([assistant([{ ...reasoning, state: "done" }])], true)?.kind).toBe("thinking");
    expect(chatActivity([assistant([{ ...reasoning, text: "" }])], true, "Ana")?.label).toBe("Thinking about what Ana would love");
    expect(chatActivity([assistant([tool("find_places", "output-available", search({})), { ...reasoning, text: "" }])], true, "Ana")?.label).toBe("Choosing the best fit for Ana");
  });

  it("stands aside for a card that shows its own progress", () => {
    const visible = [
      tool("find_places", "input-streaming"),
      tool("find_places", "input-available"),
      tool("find_places", "output-available", search({}), true),
      tool("recommend_place", "input-available"),
    ];
    for (const part of visible) expect(chatActivity([assistant([reasoning, part])], true)).toBeNull();
    expect(chatActivity([assistant([tool("get_trip_context", "input-available"), tool("find_places", "input-available")])], true)).toBeNull();
  });

  it("speaks for tools with no card", () => {
    expect(chatActivity([assistant([tool("get_trip_context", "input-available")])], true, "Ana")?.label).toBe("Reading Ana's trip");
    expect(chatActivity([assistant([tool("lookup_place", "input-streaming")])], true, "Ana")?.label).toBe("Checking the details");
  });

  it("fills every wait between model steps", () => {
    const after = (...parts: AppUIMessage["parts"]) => chatActivity([assistant(parts)], true, "Ana")?.label;
    expect(after(tool("get_trip_context", "output-available"), step)).toBe("Working out where to look");
    expect(after(tool("find_places", "output-available", search({})), step)).toBe("Choosing the best fit for Ana");
    expect(after(tool("find_places", "output-available", search({ verdicts: [{ tripPlaceId: "t1", stand: "pick" }] })), step)).toBe("Pulling up Nómada");
    expect(after(tool("find_places", "output-available", search({ places: [] })), step)).toBe("Working out what's next");
    expect(after(tool("recommend_place", "output-available"), step)).toBe("Thinking about what to plan next");
    expect(after(tool("set_itinerary", "output-available"), step)).toBe("Working out what's next");
  });

  it("stays quiet while text streams and at the end of a turn, and resumes for another step", () => {
    const text = { type: "text", text: "Here are the options.", state: "done" } as const;
    expect(chatActivity([assistant([reasoning, { ...text, state: "streaming" }])], true)).toBeNull();
    expect(chatActivity([assistant([tool("recommend_place", "output-available"), step, text])], true)).toBeNull();
    expect(chatActivity([assistant([tool("recommend_place", "output-available"), step, text, step])], true)?.kind).toBe("preparing");
  });

  it("ends on completion, failure or stop, and ignores hidden history", () => {
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
    expect(labels).toContain("Comparing dinner options");
    expect(labels).toContain("Checking the shortlist");
    expect(labels.at(-1)).toBe("Checking the shortlist");
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
