import { describe, expect, it } from "vitest";

import {
  citySuggestionDescription,
  clientDescription,
  clientTravelerNote,
  guestTravelerNote,
  missingFavoritesNote,
  nextTripLabel,
  pastDestinationDescription,
} from "./format";

describe("client rows", () => {
  it("names the next trip without repeating the client", () => {
    expect(nextTripLabel({ title: "Mexico City for Ana", startDate: "2026-11-12" }, "Ana Ruiz")).toBe("Mexico City in Nov");
    expect(nextTripLabel({ title: "Spring in Kyoto", startDate: null }, "Ana Ruiz")).toBe("Spring in Kyoto, no dates yet");
    expect(nextTripLabel(null, "Ana Ruiz")).toBeNull();
  });

  it("joins home city, favorites and next trip", () => {
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
  it("says whose favorites drive the search and flags missing ones", () => {
    expect(clientTravelerNote(6)).toEqual({ text: "Client · 6 favorites drive the search", warning: false });
    expect(clientTravelerNote(0).warning).toBe(true);
    expect(guestTravelerNote({ clientId: null, favoritesCount: 0 })).toEqual({ text: "Guest · no favorites yet", warning: true });
    expect(guestTravelerNote({ clientId: "c", favoritesCount: 3 }).warning).toBe(false);
  });

  it("names companions without favorites", () => {
    expect(missingFavoritesNote([], "Ana Ruiz")).toBeNull();
    expect(missingFavoritesNote(["Clara"], "Ana Ruiz")).toBe(
      "Clara has no favorites yet. The search follows Ana's taste, and the trip notes who is missing.",
    );
    expect(missingFavoritesNote(["Clara", "Tom Varga", "Lea"], null)).toBe("Clara, Tom and Lea have no favorites yet.");
  });
});

describe("where suggestions", () => {
  it("describes advisor cities and past destinations", () => {
    expect(citySuggestionDescription(11, "Ana Ruiz", false)).toBe("11 of your places · Ana has not been");
    expect(citySuggestionDescription(3, null, false)).toBe("3 of your places");
    expect(pastDestinationDescription("2026-03-04", 1)).toBe("Last in March 2026");
    expect(pastDestinationDescription("2026-03-04", 2)).toBe("Last in March 2026 · 2 trips");
  });
});
