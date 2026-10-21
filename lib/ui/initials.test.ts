import { describe, expect, it } from "vitest";

import { initials } from "./initials";

describe("initials", () => {
  it("takes the first and last word", () => {
    expect(initials("Ana Ruiz")).toBe("AR");
    expect(initials("Tom and Elise Varga")).toBe("TV");
  });

  it("handles one word and empty input", () => {
    expect(initials("Clara")).toBe("C");
    expect(initials("  ")).toBe("");
  });
});
