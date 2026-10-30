import { describe, expect, it } from "vitest";
import type { AppUIMessage } from "@/lib/contracts";
import { needsThinkingIndicator } from "./chat-activity";

const assistant = (parts: AppUIMessage["parts"]): AppUIMessage => ({ id: "reply", role: "assistant", parts });

describe("chat activity feedback", () => {
  it("covers connection, empty assistant and between-step gaps", () => {
    for (const messages of [[], [assistant([])], [assistant([{ type: "step-start" }])], [assistant([{ type: "text", text: "Checking.", state: "done" }])]]) {
      expect(needsThinkingIndicator(messages, true)).toBe(true);
    }
  });
  it("lets visible streaming text or reasoning carry the feedback", () => {
    for (const type of ["text", "reasoning"] as const) {
      expect(needsThinkingIndicator([assistant([{ type, text: "Checking favorites", state: "streaming" }])], true)).toBe(false);
      expect(needsThinkingIndicator([assistant([{ type, text: "", state: "streaming" }])], true)).toBe(true);
    }
  });
  it("ignores hidden messages and stops feedback when idle or interrupted", () => {
    const hidden = { ...assistant([{ type: "text", text: "Hidden", state: "streaming" }]), metadata: { hidden: true } };
    expect(needsThinkingIndicator([hidden], true)).toBe(true);
    expect(needsThinkingIndicator([assistant([])], false)).toBe(false);
  });
});
