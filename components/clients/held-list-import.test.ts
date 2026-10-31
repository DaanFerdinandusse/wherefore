import { describe, expect, it } from "vitest";

import { holdListImport, takeListImport } from "./held-list-import";

describe("held list import", () => {
  it("hands the link over once", () => {
    holdListImport("c1", "https://maps.app.goo.gl/a");
    expect(takeListImport("c1")).toBe("https://maps.app.goo.gl/a");
    expect(takeListImport("c1")).toBeNull();
  });

  it("keeps it from another client", () => {
    holdListImport("c1", "https://maps.app.goo.gl/a");
    expect(takeListImport("c2")).toBeNull();
    expect(takeListImport("c1")).toBe("https://maps.app.goo.gl/a");
  });
});
