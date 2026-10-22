import { describe, expect, it } from "vitest";

import { devTripTitle, isDevTripTitle, showDevTrips } from "../dev";

describe("dev trips", () => {
  it("prefix the title once", () => {
    expect(devTripTitle("Lisbon for Ana")).toBe("Dev: Lisbon for Ana");
    expect(devTripTitle("Dev: Lisbon for Ana")).toBe("Dev: Lisbon for Ana");
    expect(isDevTripTitle("Dev: Lisbon for Ana")).toBe(true);
    expect(isDevTripTitle("Lisbon for Ana")).toBe(false);
  });

  it("are listed outside production only", () => {
    expect(showDevTrips("development")).toBe(true);
    expect(showDevTrips("test")).toBe(true);
    expect(showDevTrips("production")).toBe(false);
  });
});
