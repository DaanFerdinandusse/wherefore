import { describe, expect, it } from "vitest";

import type { AppUIMessage } from "@/lib/contracts";
import { mapRegionPrompt } from "@/lib/map/region-prompt";

import { cleanNextPrompt, lastExchange, lastExchangeSchema, NEXT_PROMPT_MAX } from "./next-prompt";

const user = (id: string, text: string, metadata?: AppUIMessage["metadata"]): AppUIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
  metadata,
});
const reply = (id: string, text: string, metadata?: AppUIMessage["metadata"]): AppUIMessage => ({
  id,
  role: "assistant",
  parts: text ? [{ type: "text", text }] : [],
  metadata,
});

describe("lastExchange", () => {
  it("pairs the last reply with the advisor's message", () => {
    const messages = [user("u1", "Lunch in Alfama"), reply("a1", "I picked Taberna."), user("u2", "Now dinner"), reply("a2", "I picked Sessenta.")];
    expect(lastExchange(messages)).toEqual({ id: "a2", ask: "Now dinner", reply: "I picked Sessenta." });
  });

  it("reads only the reply's last words, not the text before its tool calls", () => {
    const message: AppUIMessage = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "text", text: "Let me look." },
        { type: "tool-find_places", toolCallId: "c1", state: "output-available", input: {}, output: { summary: "tool output" } },
        { type: "text", text: "I picked Taberna." },
      ],
    };
    expect(lastExchange([user("u1", "Lunch"), message])).toEqual({ id: "a1", ask: "Lunch", reply: "I picked Taberna." });
  });

  it("skips hidden messages and leaves the map marker out", () => {
    const messages = [
      user("u1", mapRegionPrompt({ lat: 38.7, lon: -9.1, radiusM: 900 }, "dinner")),
      reply("a1", "I picked Taberna."),
      user("u2", "Set up the trip", { hidden: true }),
    ];
    expect(lastExchange(messages)).toEqual({ id: "a1", ask: "Search this region of the map for dinner.", reply: "I picked Taberna." });
  });

  it("offers nothing while the advisor's message is unanswered", () => {
    expect(lastExchange([reply("a1", "Done."), user("u2", "Now dinner")])).toBeUndefined();
  });

  it("offers nothing after a stopped reply or one with no words", () => {
    expect(lastExchange([reply("a1", "I was look", { stopped: true })])).toBeUndefined();
    expect(lastExchange([reply("a1", "")])).toBeUndefined();
  });

  it("offers nothing for an empty chat", () => {
    expect(lastExchange([])).toBeUndefined();
  });

  it("cuts long messages to what the route accepts", () => {
    const exchange = lastExchange([user("u1", "word ".repeat(400)), reply("a1", "word ".repeat(400))]);
    expect(lastExchangeSchema.safeParse(exchange).success).toBe(true);
  });
});

describe("cleanNextPrompt", () => {
  it("keeps one plain line", () => {
    expect(cleanNextPrompt("Dinner on day 2 near Alfama")).toBe("Dinner on day 2 near Alfama");
  });

  it("drops quotes, a full stop and any line after the first", () => {
    expect(cleanNextPrompt("“Dinner on day 2 near Alfama.”\nOr lunch")).toBe("Dinner on day 2 near Alfama");
  });

  it("turns dashes into commas", () => {
    expect(cleanNextPrompt("Dinner on day 2 \u2014 somewhere quiet")).toBe("Dinner on day 2, somewhere quiet");
  });

  it("rejects a line that is too short or too long", () => {
    expect(cleanNextPrompt("Dinner")).toBeNull();
    expect(cleanNextPrompt("a".repeat(NEXT_PROMPT_MAX + 1))).toBeNull();
    expect(cleanNextPrompt("")).toBeNull();
  });

  it("rejects a line that names the data provider", () => {
    expect(cleanNextPrompt("Ask Qloo for dinner on day 2")).toBeNull();
  });

  it("rejects what the advisor just asked, whatever the case or punctuation", () => {
    expect(cleanNextPrompt("Dinner on day 2, near Alfama", "dinner on day 2 near alfama")).toBeNull();
  });
});
