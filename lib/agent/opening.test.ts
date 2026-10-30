import { describe, expect, it } from "vitest";

import { composeOpening, dateRange, dayName, daysBetween, joinNames, numberWord, type OpeningFacts } from "./opening";

const lisbon: OpeningFacts = {
  clientName: "Ana Ruiz",
  travelerNames: ["Ana Ruiz", "Clara"],
  destination: "Lisbon",
  startDate: "2027-05-14",
  endDate: "2027-05-18",
  favoritesCount: 5,
  advisorPlacesInCity: 11,
  filled: [],
  dayCount: 5,
};

describe("composeOpening", () => {
  it("asks for the brief on a trip with nothing planned (S1)", () => {
    expect(composeOpening(lisbon)).toEqual({
      created: "Ana and Clara, Lisbon, 14 to 18 May",
      createdFrom: "From the new trip form",
      paragraphs: [
        "Five days in Lisbon for Ana and Clara. I will match every pick to Ana's five favorites and check your 11 saved Lisbon places along the way.",
        "What should this trip be about? A mood, a few must haves, or one slot to start with is enough.",
      ],
      placeholder: "Tell me what Ana wants from Lisbon",
    });
  });

  it("leaves out what the trip does not have", () => {
    const opening = composeOpening({ ...lisbon, startDate: undefined, endDate: undefined, advisorPlacesInCity: 0, travelerNames: ["Ana Ruiz"] });
    expect(opening.created).toBe("Ana, Lisbon");
    expect(opening.paragraphs[0]).toBe("A trip to Lisbon for Ana. I will match every pick to Ana's five favorites.");
  });

  it("counts what drives the search, whoever named it", () => {
    const opening = composeOpening({
      ...lisbon,
      favoritesCount: 2,
      favoriteOwners: ["Ana Ruiz"],
      advisorPlacesInCity: 0,
    });
    expect(opening.paragraphs[0]).toContain("I will match every pick to Ana's two favorites.");

    const both = composeOpening({ ...lisbon, favoritesCount: 6, favoriteOwners: ["Ana Ruiz", "Marcus Lee"], advisorPlacesInCity: 0 });
    expect(both.paragraphs[0]).toContain("I will match every pick to Ana's and Marcus's six favorites.");

    const companionOnly = composeOpening({ ...lisbon, favoritesCount: 3, favoriteOwners: ["Marcus Lee"], advisorPlacesInCity: 0 });
    expect(companionOnly.paragraphs[0]).toContain("Marcus's three favorites");
    expect(companionOnly.paragraphs[0]).not.toContain("no favorites saved");
  });

  it("says plainly when the client has no favorites", () => {
    const opening = composeOpening({ ...lisbon, favoritesCount: 0, advisorPlacesInCity: 1 });
    expect(opening.paragraphs[0]).toContain("Ana has no favorites saved yet");
    expect(opening.paragraphs[0]).toContain("your one saved Lisbon place along the way");
  });

  it("says where the itinerary stands in a new chat on a planned trip", () => {
    const opening = composeOpening({ ...lisbon, filled: [{ day: 1, slot: "dinner" }, { day: 2, slot: "lunch" }, { day: 2, slot: "dinner" }] });
    expect(opening.paragraphs[0]).toBe(
      "Ana's Lisbon trip has three places in the itinerary so far. Nothing is planned yet on Sun 16 May, Mon 17 May and Tue 18 May.",
    );
    expect(opening.paragraphs[1]).toContain("What should we work on next?");
  });
});

describe("opening helpers", () => {
  it("formats names, numbers and dates", () => {
    expect(joinNames(["Ana Ruiz", "Clara", "Marcus Lee"])).toBe("Ana, Clara and Marcus");
    expect(numberWord(9)).toBe("nine");
    expect(numberWord(11)).toBe("11");
    expect(dateRange("2027-05-30", "2027-06-02")).toBe("30 May to 2 Jun");
    expect(dateRange("2027-05-14", "2027-05-14")).toBe("14 May");
    expect(dateRange(undefined, "2027-05-14")).toBeNull();
    expect(daysBetween("2027-05-14", "2027-05-18")).toBe(5);
    expect(dayName(3, "2027-05-14")).toBe("Sun 16 May");
    expect(dayName(3)).toBe("Day 3");
  });
});
