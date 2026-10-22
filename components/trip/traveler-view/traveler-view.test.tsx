import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { SharedTripView } from "@/lib/contracts";

import { TravelerView } from "./traveler-view";

// Rendered without photos so next/image stays out of the test.
const view: SharedTripView = {
  title: "Mexico City for Marcus",
  destinationName: "Mexico City",
  startDate: "2026-11-12",
  endDate: "2026-11-14",
  preparedFor: "Marcus",
  advisorName: "Daan",
  days: [
    {
      day: 1,
      date: "2026-11-12",
      slots: [
        {
          slot: "lunch",
          position: 0,
          place: {
            name: "Contramar",
            category: "eat",
            neighborhood: "Roma Norte",
            because: [
              { name: "Lilia", share: 30 },
              { name: "Via Carota", share: 50 },
              { name: "Attaboy", share: 20 },
            ],
            sharedTags: ["Seafood"],
          },
          advisorNote: "Go before 1 pm.",
        },
        { slot: "dinner", position: 0, advisorNote: "Dinner is on your own tonight." },
      ],
    },
  ],
};

describe("TravelerView", () => {
  it("renders the page with the share bar, the days and the footer", () => {
    const html = renderToStaticMarkup(<TravelerView view={view} embedded={false} />);
    expect(html).toContain("Prepared for Marcus");
    expect(html).toContain("<h1");
    expect(html).toContain("Thursday 12 November");
    expect(html).toContain(">Because you love Via Carota and Lilia</p>");
    expect(html).toContain("From your advisor");
    expect(html).toContain("Dinner is on your own tonight.");
    expect(html).toContain("Free day.");
    expect(html).toContain("Saturday 14 November");
    expect(html).toContain("Built from what you already love");
  });

  it("drops the share bar and the h1 when embedded", () => {
    const html = renderToStaticMarkup(<TravelerView view={view} embedded />);
    expect(html).not.toContain("Prepared for Marcus");
    expect(html).not.toContain("<h1");
    expect(html).toContain("Mexico City for Marcus");
  });
});
