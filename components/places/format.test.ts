import { describe, expect, it } from "vitest";

import {
  cityCenter,
  cleanNote,
  noteText,
  lastUseLine,
  placeTypeLabel,
  placesHref,
  quoteNote,
  savedAgo,
  tripsLine,
  typeLine,
} from "./format";

describe("placeTypeLabel and typeLine", () => {
  it("reads the genre leaf", () => {
    expect(placeTypeLabel("urn:tag:genre:place:restaurant:seafood")).toBe("Seafood");
    expect(placeTypeLabel("urn:tag:genre:place:restaurant:cocktail_bar")).toBe("Cocktail bar");
    expect(placeTypeLabel("urn:tag:genre:place:restaurant")).toBe("Restaurant");
    expect(placeTypeLabel(null)).toBeNull();
    expect(placeTypeLabel("")).toBeNull();
  });

  it("joins type and neighborhood, or shows whichever exists", () => {
    expect(typeLine({ primaryType: "urn:tag:genre:place:restaurant:seafood", neighborhood: "Roma Norte" })).toBe(
      "Seafood · Roma Norte",
    );
    expect(typeLine({ primaryType: null, neighborhood: "Alfama" })).toBe("Alfama");
    expect(typeLine({ primaryType: null, neighborhood: "  " })).toBeNull();
  });
});

describe("note formatting", () => {
  it("quotes the note once, dropping quotes the advisor typed", () => {
    expect(quoteNote("Book the 1:30 sitting.")).toBe("“Book the 1:30 sitting.”");
    expect(quoteNote('"Sit at the bar"')).toBe("“Sit at the bar”");
    expect(quoteNote("“Already curly”")).toBe("“Already curly”");
    expect(quoteNote("   ")).toBeNull();
    expect(quoteNote(null)).toBeNull();
    expect(noteText(" \"Sit at the bar\" ")).toBe("Sit at the bar");
    expect(noteText("")).toBeNull();
  });

  it("cleans a note for storage", () => {
    expect(cleanNote("  Ask for\r\nthe corner table  ")).toBe("Ask for\nthe corner table");
    expect(cleanNote("x".repeat(600))).toHaveLength(500);
  });

  it("says how a place was used", () => {
    expect(tripsLine(0)).toBe("Not used yet");
    expect(tripsLine(1)).toBe("In 1 trip");
    expect(tripsLine(6)).toBe("In 6 trips");
    const now = new Date("2026-10-21T12:00:00Z");
    expect(lastUseLine({ lastClientName: "Ana Ruiz", savedAt: now }, now)).toBe("Last for Ana Ruiz");
    expect(lastUseLine({ lastClientName: null, savedAt: "2026-10-07T12:00:00Z" }, now)).toBe("Saved 2 weeks ago");
  });

  it("words the saved date", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    expect(savedAgo("2026-10-21T08:00:00Z", now)).toBe("Saved today");
    expect(savedAgo("2026-10-20T08:00:00Z", now)).toBe("Saved yesterday");
    expect(savedAgo("2026-10-17T12:00:00Z", now)).toBe("Saved 4 days ago");
    expect(savedAgo("2026-10-13T12:00:00Z", now)).toBe("Saved 1 week ago");
    expect(savedAgo("2025-03-10T12:00:00Z", now)).toBe("Saved March 2025");
  });
});

describe("cityCenter", () => {
  it("averages the places in that city that have coordinates", () => {
    const center = cityCenter(
      [
        { city: "Lisbon", lat: 38.7, lon: -9.1 },
        { city: "lisbon", lat: 38.72, lon: -9.14 },
        { city: "Lisbon", lat: null, lon: null },
        { city: "Porto", lat: 41.15, lon: -8.61 },
      ],
      "Lisbon",
    );
    expect(center).toEqual({ lat: 38.71, lon: -9.12 });
    expect(cityCenter([{ city: "Lisbon", lat: null, lon: null }], "Lisbon")).toBeNull();
  });
});

describe("placesHref", () => {
  it("keeps only the parts that are set", () => {
    expect(placesHref({})).toBe("/places");
    expect(placesHref({ city: "Lisboa", category: "hotels", client: "c1" })).toBe(
      "/places?city=Lisboa&category=hotels&client=c1",
    );
    expect(placesHref({ city: "Mexico City", list: "team" })).toBe("/places?list=team&city=Mexico+City");
    expect(placesHref({ city: "", category: null, client: " ", list: "mine" })).toBe("/places");
  });
});
