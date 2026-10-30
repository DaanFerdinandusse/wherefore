import { describe, expect, it } from "vitest";

import { CHAT_TITLE_MAX, chatTitleFrom, shortLine } from "./chat-title";

describe("shortLine", () => {
  it("keeps a short line as is, whitespace collapsed", () => {
    expect(shortLine("  Day 2   lunch\n near Roma  ")).toBe("Day 2 lunch near Roma");
  });

  it("cuts a long line on a word boundary with an ellipsis", () => {
    const text = "Saturday art near Condesa, something quiet after a long lunch with the kids and their grandparents";
    const line = shortLine(text);
    expect(line.length).toBeLessThanOrEqual(CHAT_TITLE_MAX + 1);
    expect(line.endsWith("…")).toBe(true);
    expect(text.startsWith(line.slice(0, -1))).toBe(true);
    expect(text.charAt(line.length - 1)).toMatch(/[\s,]/);
  });

  it("drops trailing punctuation before the ellipsis", () => {
    expect(shortLine("Coffee near the hotel, quiet, early, please", 24)).toBe("Coffee near the hotel…");
  });

  it("cuts one very long word rather than return nothing", () => {
    expect(shortLine("a".repeat(80), 20)).toBe(`${"a".repeat(20)}…`);
  });
});

describe("chatTitleFrom", () => {
  it("names the chat from the advisor's text", () => {
    expect(
      chatTitleFrom({ role: "user", parts: [{ type: "text", text: "Day 2 lunch" }, { type: "text", text: "somewhere lively" }] }),
    ).toBe("Day 2 lunch somewhere lively");
  });

  it("gives no title for a hidden message or an empty one", () => {
    expect(chatTitleFrom({ role: "user", parts: [{ type: "text", text: "Seed brief" }], metadata: { hidden: true, kind: "seed" } })).toBeNull();
    expect(chatTitleFrom({ role: "user", parts: [{ type: "text", text: "   " }] })).toBeNull();
    expect(chatTitleFrom({ role: "assistant", parts: [{ type: "text", text: "Hi" }] })).toBeNull();
  });
});
