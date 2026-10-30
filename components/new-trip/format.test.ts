import { describe, expect, it } from "vitest";

import {
  cityCardLine,
  clientDescription,
  clientLine,
  clientTravelerNote,
  companionNote,
  countryName,
  createHint,
  destinationLabel,
  nextTripLabel,
} from "./format";

describe("client rows", () => {
  it("names the next trip without repeating the client", () => {
    expect(nextTripLabel({ title: "Mexico City for Ana", startDate: "2026-11-12" }, "Ana Ruiz")).toBe("Mexico City in Nov");
    expect(nextTripLabel({ title: "Spring in Kyoto", startDate: null }, "Ana Ruiz")).toBe("Spring in Kyoto, no dates yet");
    expect(nextTripLabel(null, "Ana Ruiz")).toBeNull();
  });

  it("says a trip that already started is under way", () => {
    const trip = { title: "Lisbon for Priya", startDate: "2026-10-27" };
    expect(nextTripLabel(trip, "Priya Shah", "2026-10-29")).toBe("in Lisbon now");
    expect(nextTripLabel(trip, "Priya Shah", "2026-10-26")).toBe("Lisbon in Oct");
  });

  it("joins home city and next trip for the recent client row", () => {
    expect(
      clientLine(
        { name: "Ana Ruiz", homeCity: "New York", nextTrip: { title: "Mexico City for Ana", startDate: "2026-11-12" } },
        "2026-10-29",
      ),
    ).toBe("New York · Mexico City in Nov");
    expect(clientLine({ name: "Tom", homeCity: "Amsterdam", nextTrip: null })).toBe("Amsterdam");
    expect(clientLine({ name: "Tom", homeCity: null, nextTrip: null })).toBeNull();
  });

  it("describes a client match with the favorites count", () => {
    expect(
      clientDescription({
        name: "Ana Ruiz",
        homeCity: "New York",
        favoritesCount: 6,
        nextTrip: { title: "Mexico City for Ana", startDate: "2026-11-12" },
      }),
    ).toBe("New York · 6 favorites · Mexico City in Nov");
    expect(clientDescription({ name: "Tom", homeCity: null, favoritesCount: 1, nextTrip: null })).toBe("1 favorite");
  });
});

describe("traveler notes", () => {
  it("says whose favorites drive the search, by first name", () => {
    expect(clientTravelerNote("Ana Ruiz", 5)).toEqual({ text: "Ana's 5 favorites drive the search", warning: false });
    expect(clientTravelerNote("Ana Ruiz", 1).text).toBe("Ana's 1 favorite drives the search");
    expect(clientTravelerNote("Ana Ruiz", 0)).toEqual({ text: "Ana has no favorites yet", warning: true });
  });

  it("describes companions without inventing favorites", () => {
    expect(companionNote({ name: "Clara", clientId: null, favoritesCount: 0 }, "Ana Ruiz")).toBe("Travels with Ana");
    expect(companionNote({ name: "Clara", clientId: null, favoritesCount: 0 }, null)).toBeNull();
    expect(companionNote({ name: "Marcus Lee", clientId: "c", favoritesCount: 3 }, "Ana Ruiz")).toBe(
      "Marcus's 3 favorites join the search",
    );
    expect(companionNote({ name: "Marcus Lee", clientId: "c", favoritesCount: 0 }, "Ana Ruiz")).toBe("No favorites yet");
  });

  it("explains that creating opens a chat", () => {
    expect(createHint("Ana Ruiz", 5)).toBe(
      "Creating the trip opens a chat. Tell it what Ana wants and it searches from Ana's favorites. You can change anything later.",
    );
    expect(createHint("Ana Ruiz", 0)).toBe(
      "Creating the trip opens a chat. Tell it what Ana wants and it starts the search from there. You can change anything later.",
    );
  });
});

describe("destinations", () => {
  it("names the country from its code", () => {
    expect(countryName("PT")).toBe("Portugal");
    expect(countryName("mx")).toBe("Mexico");
    expect(countryName(undefined)).toBeNull();
    expect(countryName("XYZ")).toBeNull();
  });

  it("adds the country to the destination once", () => {
    expect(destinationLabel({ name: "Lisboa", countryCode: "PT" })).toBe("Lisboa, Portugal");
    expect(destinationLabel({ name: "Lisboa" })).toBe("Lisboa");
    expect(destinationLabel({ name: "Mexico City", countryCode: "MX" })).toBe("Mexico City");
  });

  it("describes a city card", () => {
    expect(cityCardLine({ count: 11, clientName: "Ana Ruiz", went: undefined })).toEqual({
      places: "11 of your places",
      rest: "Ana has not been",
    });
    expect(cityCardLine({ count: 6, clientName: "Ana Ruiz", went: "2026-03-06" })).toEqual({
      places: "6 of your places",
      rest: "Ana went in Mar 2026",
    });
    expect(cityCardLine({ count: 0, clientName: "Ana Ruiz", went: null })).toEqual({ places: null, rest: "Ana went before" });
    expect(cityCardLine({ count: 3, clientName: null, went: undefined })).toEqual({ places: "3 of your places", rest: null });
  });
});
