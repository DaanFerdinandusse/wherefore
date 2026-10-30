import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SharedTripView } from "@/lib/contracts";

import { TravelerView } from "./traveler-view";

// Rendered without photos so next/image stays out of the test.
const view: SharedTripView = {
  title: "Lisbon for Ana",
  destinationName: "Lisbon",
  startDate: "2027-05-14",
  endDate: "2027-05-18",
  preparedFor: "Ana",
  advisorName: "Sofía Marín",
  advisorEmail: "sofia@atelier.test",
  favorites: [{ name: "Via Carota" }, { name: "Ace Hotel" }],
  days: [
    {
      day: 1,
      date: "2027-05-14",
      slots: [
        {
          slot: "dinner",
          position: 0,
          place: {
            name: "Sea Me",
            category: "eat",
            neighborhood: "Encarnação",
            because: [{ name: "Via Carota", share: 60 }],
            sharedTags: ["Lively"],
            description: "A fish market and restaurant in one.",
            keywords: ["Oysters", "Fresh fish"],
            dishes: ["Oysters", "Grilled octopus"],
          },
          advisorNote: "Ask for a seat at the counter.",
        },
        { slot: "night", position: 0, advisorNote: "The night is yours." },
        {
          slot: "stay",
          position: 0,
          place: {
            name: "Valverde",
            category: "stay",
            because: [{ name: "Ace Hotel", share: 100 }],
            sharedTags: [],
            hotelClass: 5,
          },
        },
      ],
    },
    // A free day: the projection leaves empty days out, and so does the page.
  ],
};

describe("TravelerView", () => {
  it("renders the hero, the favorites, the day, the stay and the footer from facts", () => {
    const html = renderToStaticMarkup(<TravelerView view={view} />);
    expect(html).toContain("<h1");
    expect(html).toContain("Lisbon,<br/>for Ana");
    expect(html).toContain("14 to 18 May");
    expect(html).toContain("One day and two places, matched to what you already love: Via Carota and Ace Hotel.");
    expect(html).toContain("Every place here is matched to one you already love.");
    expect(html).toContain(">Friday</h2>");
    expect(html).toContain("14 May · Encarnação");
    expect(html).toContain("Because you love Via Carota: the same lively feel.");
    expect(html).toContain("Oysters · Fresh fish");
    expect(html).toContain("oysters, grilled octopus");
    expect(html).toContain("From Sofía");
    expect(html).toContain("The night is yours.");
    expect(html).toContain("You stay at Valverde");
    expect(html).toContain("Four nights · 5-star hotel");
    expect(html).toContain("Because you love Ace Hotel.");
    expect(html).toContain('href="mailto:sofia@atelier.test?subject=Lisbon%20for%20Ana"');
    expect(html).toContain("Message Sofía");
  });

  it("leaves the contact action out without an email", () => {
    const html = renderToStaticMarkup(<TravelerView view={{ ...view, advisorEmail: undefined }} />);
    expect(html).not.toContain("mailto:");
    expect(html).toContain("Want to change something?");
  });
});
