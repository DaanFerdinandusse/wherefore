import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import type { AppUIMessage, FindPlacesOutput, TripPlaceCard } from "@/lib/contracts";

import { budgetHistory, estimateTokens, HISTORY_TOKEN_BUDGET, LARGE_OUTPUT_CHARS, OMITTED_OUTPUT_NOTE } from "./history";
import { toModelHistory } from "./messages";
import { historyTools } from "./tools";
import { cardForModel, findPlacesForModel, recommendPlaceForModel } from "./tools/model-output";

// Later turns replay earlier tool outputs: through each tool's compact model
// view, and inside a total token budget.

const user = (id: string, text: string): ModelMessage => ({ role: "user", content: [{ type: "text", text }] });
const call = (id: string): ModelMessage => ({
  role: "assistant",
  content: [{ type: "tool-call", toolCallId: id, toolName: "find_places", input: { intent: "wine" } }],
});
const result = (id: string, size: number): ModelMessage => ({
  role: "tool",
  content: [{ type: "tool-result", toolCallId: id, toolName: "find_places", output: { type: "text", value: "x".repeat(size) } }],
});
const reply = (text: string): ModelMessage => ({ role: "assistant", content: [{ type: "text", text }] });

function pairsHold(messages: ModelMessage[]): boolean {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const p of m.content) if (p.type === "tool-call") calls.add(p.toolCallId);
    }
    if (m.role === "tool") for (const p of m.content) if (p.type === "tool-result") results.add(p.toolCallId);
  }
  return [...calls].every((id) => results.has(id)) && [...results].every((id) => calls.has(id));
}

describe("budgetHistory", () => {
  const history = [
    user("u1", "natural wine"),
    call("c1"),
    result("c1", 8_000),
    reply("Found 12."),
    user("u2", "dinner"),
    call("c2"),
    result("c2", 8_000),
    reply("Found 10."),
    user("u3", "and coffee?"),
  ];

  it("leaves a history under budget alone", () => {
    expect(budgetHistory(history, 100_000)).toBe(history);
  });

  it("stubs the oldest tool outputs first and keeps every call paired with its result", () => {
    const out = budgetHistory(history, 2_500);
    expect(out).toHaveLength(history.length);
    const outputs = out.flatMap((m) => (m.role === "tool" ? m.content : [])).map((p) => ("output" in p ? p.output : undefined));
    expect(outputs[0]).toEqual({ type: "text", value: OMITTED_OUTPUT_NOTE });
    expect(outputs[1]).toEqual({ type: "text", value: "x".repeat(8_000) });
    expect(pairsHold(out)).toBe(true);
    expect(estimateTokens(out)).toBeLessThanOrEqual(2_500 + 50);
  });

  it("drops the oldest whole exchanges when stubs are not enough, never the last user message", () => {
    const long = [user("u0", "y".repeat(20_000)), reply("ok"), ...history];
    const out = budgetHistory(long, 600);
    expect(out[0]?.role).toBe("user");
    expect(out.at(-1)).toEqual(history.at(-1));
    expect(pairsHold(out)).toBe(true);
    expect(JSON.stringify(out)).not.toContain("y".repeat(100));
  });
});

describe("toModelHistory with the tools", () => {
  const output: FindPlacesOutput = {
    phase: "done",
    kind: "ask",
    askId: "ask-1",
    label: "Natural wine",
    count: 1,
    elapsedMs: 1400,
    loosened: [],
    details: "Lisbon · based on Ana's favorites",
    places: [
      {
        tripPlaceId: "tp-1",
        placeId: "p-1",
        entityId: "e-1",
        name: "Senhor Uva",
        category: "drink",
        imageUrl: "https://images.example.test/a-very-long-image-url.jpg",
        address: "Rua de Santo Amaro 2, Lisbon",
        because: [{ entityId: "e-via", name: "Via Carota", share: 100 }],
        sharedTags: [],
        status: "suggested",
        source: "ask",
        askIds: ["ask-1"],
      },
    ],
  };
  const messages: AppUIMessage[] = [
    { id: "u1", role: "user", parts: [{ type: "text", text: "natural wine" }] },
    {
      id: "a-t1",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "tool-find_places", toolCallId: "c1", state: "output-available", input: { intent: "natural wine" }, output },
      ],
    },
    { id: "u2", role: "user", parts: [{ type: "text", text: "more" }] },
  ];

  it("replays a saved output as the compact <trip_data> copy, not the card JSON", async () => {
    const history = await toModelHistory(messages, { tools: historyTools() });
    const tool = history.find((m) => m.role === "tool");
    const part = tool?.role === "tool" ? tool.content[0] : undefined;
    const value = part && "output" in part && part.output.type === "text" ? part.output.value : "";
    expect(value.startsWith("<trip_data>")).toBe(true);
    expect(value).toContain("Senhor Uva");
    expect(value).not.toContain("a-very-long-image-url");
    expect(value).not.toContain("Rua de Santo Amaro");
  });

  it("does not throw on an old output shape", async () => {
    const old = structuredClone(messages);
    const part = old[1]!.parts[1] as { output: unknown };
    part.output = { phase: "done" };
    const history = await toModelHistory(old, { tools: historyTools() });
    expect(history.some((m) => m.role === "tool")).toBe(true);
  });
});

describe("the facts stay inside the size budget", () => {
  // Every fact present at its largest. Measured on real places: 860 characters
  // at the median, 1,240 at most, so a 5 place search is about 1,200 tokens.
  const list = (prefix: string, count: number, size: number) =>
    Array.from({ length: count }, (_, i) => `${prefix} ${i}`.padEnd(size, "x"));
  const fullCard = (id: string): TripPlaceCard => ({
    tripPlaceId: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
    placeId: `11111111-0000-4000-8000-${id.padStart(12, "0")}`,
    entityId: `22222222-0000-4000-8000-${id.padStart(12, "0")}`,
    name: "A Place With A Reasonably Long Name",
    category: "eat",
    neighborhood: "Bairro Alto",
    score: 88,
    because: [
      { entityId: "e1", name: "Via Carota", share: 60 },
      { entityId: "e2", name: "Khruangbin", share: 40 },
    ],
    sharedTags: list("Tag", 4, 12).map((name) => ({ tagId: name, name })),
    reason: "Because Ana loves Via Carota and In the Mood for Love, this one shares its candlelit, unhurried room.",
    status: "suggested",
    source: "ask",
    askIds: ["ask-1"],
    keywords: list("Keyword", 8, 18).map((name) => ({ name, count: 40 })),
    dishes: list("Dish", 4, 28),
    priceLevel: 3,
    rating: 4.6,
    popularity: 0.4,
    michelin: true,
    about: "x".repeat(200),
    // 24 names, the card's cap.
    practical: {
      dietary: list("Dietary", 13, 14),
      accessibility: list("Access", 7, 30),
      noise: ["Moderate"],
      planning: list("Planning", 3, 30),
    },
  });

  const output = (count: number): FindPlacesOutput => ({
    phase: "done",
    kind: "ask",
    askId: "ask-1",
    label: "Dinner",
    count,
    elapsedMs: 900,
    loosened: [],
    groundRules: list("No", 8, 40),
    places: Array.from({ length: count }, (_, i) => fullCard(String(i))),
  });

  it("keeps one card's model view compact", () => {
    expect(JSON.stringify(cardForModel(fullCard("1"))).length).toBeLessThan(1_600);
  });

  it("leaves a recommended card small enough that a long tool loop keeps it", () => {
    const { value } = recommendPlaceForModel({ card: fullCard("1") });
    expect(value.length).toBeLessThan(LARGE_OUTPUT_CHARS);
  });

  it("fits the three searches of one reply, each at its largest, in the budget with room to spare", () => {
    // 8 results and 2 of the advisor's own places.
    const tokens = estimateTokens(findPlacesForModel(output(10)));
    expect(tokens).toBeLessThan(4_500);
    expect(tokens * 3).toBeLessThan(HISTORY_TOKEN_BUDGET * 0.6);
  });

  it("replays through budgetHistory: old searches go first, the newest stays whole", () => {
    const search = (id: string): ModelMessage => ({
      role: "tool",
      content: [{ type: "tool-result", toolCallId: id, toolName: "find_places", output: findPlacesForModel(output(10)) }],
    });
    const history = Array.from({ length: 8 }, (_, i) => [user(`u${i}`, "more"), call(`c${i}`), search(`c${i}`)]).flat();
    const out = budgetHistory(history);
    expect(estimateTokens(out)).toBeLessThanOrEqual(HISTORY_TOKEN_BUDGET + 200);
    expect(out.at(-1)).toEqual(history.at(-1));
    expect(pairsHold(out)).toBe(true);
  });
});
