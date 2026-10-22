import { describe, expect, it } from "vitest";

import { becauseLine, joinNames, pinLabel, typeLine } from "./label";

const senhorUva = {
  name: "Senhor Uva",
  score: 87,
  yourPlace: { advisorPlaceId: "ap1", note: "Ask for the orange flight." },
  because: [
    { entityId: "e2", name: "Lilia", share: 30 },
    { entityId: "e1", name: "Via Carota", share: 70 },
  ],
};

describe("pinLabel", () => {
  it("builds the hover label from the card", () => {
    expect(pinLabel(senhorUva, "Ana Ruiz")).toEqual({
      title: "Senhor Uva · 87",
      detail: "Your place · because Ana loves Via Carota",
      text: "Senhor Uva · 87 · Your place · because Ana loves Via Carota",
    });
  });

  it("leaves out what the card does not have", () => {
    expect(pinLabel({ name: "Prado", because: [] }, "Ana Ruiz")).toEqual({ title: "Prado", detail: "", text: "Prado" });
    expect(pinLabel({ name: "Prado", score: 80, because: [] }, "Ana Ruiz").text).toBe("Prado · 80");
    expect(pinLabel({ ...senhorUva, yourPlace: undefined }, "Ana").detail).toBe("because Ana loves Via Carota");
  });

  it("never mentions distance or time", () => {
    const { text } = pinLabel(senhorUva, "Ana Ruiz");
    expect(text).not.toMatch(/\b(km|min|m)\b/);
  });
});

describe("becauseLine", () => {
  it("names the strongest favorites, two by default", () => {
    expect(becauseLine(senhorUva, "Ana Ruiz")).toBe("Because Ana loves Via Carota and Lilia");
    expect(becauseLine(senhorUva, "Ana Ruiz", 1)).toBe("Because Ana loves Via Carota");
  });

  it("is empty without favorites", () => {
    expect(becauseLine({ because: [] }, "Ana Ruiz")).toBe("");
  });
});

describe("joinNames", () => {
  it("joins with commas and a final and", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("typeLine", () => {
  it("uses the category and neighborhood that exist", () => {
    expect(typeLine({ category: "drink", neighborhood: "Príncipe Real" })).toBe("Drink · Príncipe Real");
    expect(typeLine({ category: "other", neighborhood: "Baixa" })).toBe("Baixa");
    expect(typeLine({ category: "eat" })).toBe("Eat");
  });
});
