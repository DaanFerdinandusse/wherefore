import { describe, expect, it } from "vitest";

import type { AppUIMessage } from "@/lib/contracts";
import { mapRegionPrompt } from "@/lib/map/region-prompt";

import { cleanNextPrompts, DEFAULT_PROMPTS, lastExchange, lastExchangeSchema, NEXT_LABEL_MAX, NEXT_PROMPT_MAX, promptsToOffer } from "./next-prompt";

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
    expect(lastExchange(messages)).toEqual({ id: "a2", ask: "Now dinner", reply: "I picked Sessenta.", earlier: ["Lunch in Alfama"] });
  });

  it("keeps the last few earlier asks, cut to what the route accepts", () => {
    const asks = Array.from({ length: 9 }, (_, i) => [user(`u${i}`, `Ask ${i} ${"word ".repeat(40)}`), reply(`a${i}`, "Done.")]).flat();
    const exchange = lastExchange(asks);
    expect(exchange?.earlier).toHaveLength(6);
    expect(exchange?.earlier[0]).toContain("Ask 2");
    expect(exchange?.earlier.at(-1)).toContain("Ask 7");
    expect(lastExchangeSchema.safeParse(exchange).success).toBe(true);
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
    expect(lastExchange([user("u1", "Lunch"), message])).toEqual({ id: "a1", ask: "Lunch", reply: "I picked Taberna.", earlier: [] });
  });

  it("skips hidden messages and leaves the map marker out", () => {
    const messages = [
      user("u1", mapRegionPrompt({ lat: 38.7, lon: -9.1, radiusM: 900 }, "dinner")),
      reply("a1", "I picked Taberna."),
      user("u2", "Set up the trip", { hidden: true }),
    ];
    expect(lastExchange(messages)).toEqual({ id: "a1", ask: "Search this region of the map for dinner.", reply: "I picked Taberna.", earlier: [] });
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

describe("promptsToOffer", () => {
  it("offers the defaults until a reply has pills of its own", () => {
    expect(promptsToOffer([])).toBe(DEFAULT_PROMPTS);
    const generated = [{ label: "Coffee stop", prompt: "Now a quiet coffee stop near the lunch spot" }];
    expect(promptsToOffer(generated)).toBe(generated);
  });

  it("keeps every default within the limits a pill has", () => {
    expect(DEFAULT_PROMPTS).toHaveLength(5);
    for (const option of DEFAULT_PROMPTS) expect(cleanNextPrompts([option])).toEqual([option]);
  });
});

describe("cleanNextPrompts", () => {
  const dinner = { label: "Dinner nearby", prompt: "Find dinner on day 2 near Alfama" };
  const coffee = { label: "Coffee stop", prompt: "Now a quiet coffee stop near the lunch spot" };
  const museum = { label: "A museum", prompt: "Add a small museum for the afternoon of day 2" };

  it("keeps the label and the longer message of each option", () => {
    expect(cleanNextPrompts([dinner, coffee, museum])).toEqual([dinner, coffee, museum]);
  });

  it("offers three at most", () => {
    const fourth = { label: "A late drink", prompt: "Drinks after dinner around there" };
    expect(cleanNextPrompts([dinner, coffee, museum, fourth])).toEqual([dinner, coffee, museum]);
  });

  it("drops quotes, a full stop and any line after the first", () => {
    expect(cleanNextPrompts([{ label: "“Dinner nearby.”", prompt: "“Find dinner on day 2 near Alfama.”\nOr lunch" }])).toEqual([dinner]);
  });

  it("turns dashes into commas", () => {
    const [option] = cleanNextPrompts([{ label: "Dinner \u2014 quiet", prompt: "Dinner on day 2 \u2014 somewhere quiet" }]);
    expect(option).toEqual({ label: "Dinner, quiet", prompt: "Dinner on day 2, somewhere quiet" });
  });

  it("leaves out an option whose label or message has the wrong length, and keeps the rest", () => {
    const options = [
      { label: "Ok", prompt: dinner.prompt },
      { label: "a".repeat(NEXT_LABEL_MAX + 1), prompt: dinner.prompt },
      { label: dinner.label, prompt: "Dinner" },
      { label: dinner.label, prompt: "a".repeat(NEXT_PROMPT_MAX + 1) },
      coffee,
    ];
    expect(cleanNextPrompts(options)).toEqual([coffee]);
  });

  it("leaves out an option that names the data provider, in the label or the message", () => {
    expect(cleanNextPrompts([{ label: "Ask Qloo", prompt: dinner.prompt }])).toEqual([]);
    expect(cleanNextPrompts([{ label: dinner.label, prompt: "Ask Qloo for dinner on day 2" }])).toEqual([]);
  });

  it("leaves out what the advisor just asked, whatever the case or punctuation", () => {
    expect(cleanNextPrompts([{ label: dinner.label, prompt: "Dinner on day 2, near Alfama" }], "dinner on day 2 near alfama")).toEqual([]);
  });

  it("leaves out a second pill with the same label or the same message", () => {
    expect(cleanNextPrompts([dinner, { label: "dinner nearby", prompt: coffee.prompt }, { label: coffee.label, prompt: dinner.prompt }])).toEqual([dinner]);
  });

  it("offers nothing when no option is usable", () => {
    expect(cleanNextPrompts([])).toEqual([]);
  });
});
