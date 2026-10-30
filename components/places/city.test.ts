import { describe, expect, it } from "vitest";

import type { Category } from "@/lib/contracts";

import {
  categoryTabs,
  cityFact,
  citySummaries,
  clientsGoingTo,
  clientTripLine,
  defaultClientId,
  firstName,
  mixLine,
  parseCategory,
  placeSections,
  shortDay,
  tabIsActive,
  type CityTripFields,
} from "./city";

const place = (category: Category, extra: Partial<{ city: string; country: string | null; imageUrl: string | null; id: string }> = {}) => ({
  city: extra.city ?? "Lisboa",
  category,
  country: extra.country ?? "Portugal",
  imageUrl: extra.imageUrl ?? null,
  id: extra.id ?? category,
});

const TODAY = "2026-10-29";

const trip = (clientId: string, clientName: string, city: string, startDate: string | null, endDate: string | null): CityTripFields => ({
  clientId,
  clientName,
  city,
  startDate,
  endDate,
});

describe("category filters", () => {
  it("accepts tab slugs and the restaurants and bars section, nothing else", () => {
    expect(parseCategory("hotels")).toBe("hotels");
    expect(parseCategory(" Bars ")).toBe("bars");
    expect(parseCategory("restaurants-and-bars")).toBe("restaurants-and-bars");
    expect(parseCategory("guides")).toBeNull();
    expect(parseCategory("")).toBeNull();
    expect(parseCategory(undefined)).toBeNull();
  });

  it("makes one tab per category that exists, with counts", () => {
    const tabs = categoryTabs([place("stay"), place("eat"), place("eat"), place("drink")]);
    expect(tabs).toEqual([
      { slug: "hotels", label: "Hotels", count: 1 },
      { slug: "restaurants", label: "Restaurants", count: 2 },
      { slug: "bars", label: "Bars", count: 1 },
    ]);
  });

  it("lights both restaurants and bars for their shared section", () => {
    expect(tabIsActive("restaurants", "restaurants-and-bars")).toBe(true);
    expect(tabIsActive("bars", "restaurants-and-bars")).toBe(true);
    expect(tabIsActive("hotels", "restaurants-and-bars")).toBe(false);
    expect(tabIsActive("hotels", null)).toBe(false);
  });
});

describe("placeSections", () => {
  const places = [
    ...Array.from({ length: 6 }, (_, i) => place("stay", { id: `h${i}` })),
    ...Array.from({ length: 3 }, (_, i) => place("eat", { id: `r${i}` })),
    place("drink", { id: "b0" }),
    place("coffee", { id: "c0" }),
  ];

  it("previews four per section on All, with a link when there are more", () => {
    const sections = placeSections(places, null);
    expect(sections.map((s) => [s.title, s.places.length, s.total, s.seeAll?.label ?? null])).toEqual([
      ["Hotels", 4, 6, "All 6 hotels"],
      ["Restaurants and bars", 4, 4, null],
      ["Cafes", 1, 1, null],
    ]);
    expect(sections[0].seeAll?.filter).toBe("hotels");
  });

  it("names the food section by what it holds", () => {
    expect(placeSections([place("drink")], null)[0].title).toBe("Bars");
    expect(placeSections([place("eat")], null)[0].title).toBe("Restaurants");
  });

  it("shows one full section for a filter, and none when it is empty", () => {
    const [hotels] = placeSections(places, "hotels");
    expect(hotels.places).toHaveLength(6);
    expect(hotels.seeAll).toBeNull();
    expect(placeSections(places, "restaurants-and-bars")[0].places.map((p) => p.id)).toEqual(["r0", "r1", "r2", "b0"]);
    expect(placeSections(places, "sights")).toEqual([]);
  });
});

describe("city tiles", () => {
  it("words the kinds of places a city has", () => {
    expect(mixLine([place("stay"), place("stay"), place("eat"), place("drink"), place("coffee")])).toBe(
      "2 hotels, 3 to eat",
    );
    expect(mixLine([place("stay"), place("see")])).toBe("1 hotel, 1 to see");
    expect(mixLine([place("other")])).toBeNull();
  });

  it("writes short days with the year only when it is another year", () => {
    expect(shortDay("2026-11-12", TODAY)).toBe("12 Nov");
    expect(shortDay("2027-05-14", TODAY)).toBe("14 May 2027");
  });

  it("says who is there now, then who goes next, then when the last trip ended", () => {
    const trips = [
      trip("a", "Ana Ruiz", "Lisboa", "2027-05-14", "2027-05-18"),
      trip("m", "Marcus Lee", "Lisboa", "2026-11-12", "2026-11-16"),
      trip("s", "Sofia Haddad", "Paris", "2026-10-28", "2026-11-01"),
      trip("o", "Ana Ruiz", "Oaxaca", "2024-09-06", "2024-09-10"),
      trip("x", "Lena Okafor", "Berlin", null, null),
    ];
    expect(cityFact(trips, "lisboa", TODAY)).toBe("Marcus Lee goes 12 Nov");
    expect(cityFact(trips, "Paris", TODAY)).toBe("Sofia Haddad is there now");
    expect(cityFact(trips, "Oaxaca", TODAY)).toBe("Last trip in Sep 2024");
    expect(cityFact(trips, "Berlin", TODAY)).toBeNull();
    expect(cityFact(trips, "Tokyo", TODAY)).toBeNull();
  });

  it("scores for the client there now, else the next to go, else nobody", () => {
    const trips = [
      trip("a", "Ana Ruiz", "Lisboa", "2027-05-14", "2027-05-18"),
      trip("m", "Marcus Lee", "Lisboa", "2026-11-12", "2026-11-16"),
      trip("s", "Sofia Haddad", "Paris", "2026-10-28", "2026-11-01"),
      trip("o", "Ana Ruiz", "Oaxaca", "2024-09-06", "2024-09-10"),
    ];
    expect(defaultClientId(trips, "Lisboa", TODAY)).toBe("m");
    expect(defaultClientId(trips, "Paris", TODAY)).toBe("s");
    expect(defaultClientId(trips, "Oaxaca", TODAY)).toBeNull();
    expect(clientsGoingTo(trips, "Lisboa", TODAY)).toEqual(["m", "a"]);
  });

  it("words a client's trip to the city for the picker", () => {
    const trips = [
      trip("m", "Marcus Lee", "Lisboa", "2026-11-12", "2026-11-16"),
      trip("s", "Sofia Haddad", "Lisboa", "2026-10-28", "2026-11-01"),
      trip("l", "Lena Okafor", "Lisboa", null, null),
      trip("o", "Ana Ruiz", "Lisboa", "2024-09-06", "2024-09-10"),
    ];
    expect(clientTripLine(trips, "m", "Lisboa", TODAY)).toBe("Goes 12 Nov");
    expect(clientTripLine(trips, "s", "Lisboa", TODAY)).toBe("In Lisboa now");
    expect(clientTripLine(trips, "l", "Lisboa", TODAY)).toBe("Trip not dated yet");
    expect(clientTripLine(trips, "o", "Lisboa", TODAY)).toBeNull();
    expect(clientsGoingTo(trips, "Lisboa", TODAY)).toEqual(["s", "m", "l"]);
  });

  it("summarizes cities, most places first, with the most common country and the first photo", () => {
    const summaries = citySummaries(
      [
        place("stay", { city: "Lisboa", imageUrl: null }),
        place("eat", { city: "lisboa", imageUrl: "https://example.test/1.jpg" }),
        place("eat", { city: "Lisboa", country: null }),
        place("eat", { city: "Ciudad de México", country: "Mexico" }),
        place("eat", { city: "  " }),
      ],
      [trip("m", "Marcus Lee", "Ciudad de México", "2026-11-12", "2026-11-16")],
      TODAY,
    );
    expect(summaries).toEqual([
      {
        city: "Lisboa",
        count: 3,
        country: "Portugal",
        imageUrl: "https://example.test/1.jpg",
        mix: "1 hotel, 2 to eat",
        fact: null,
      },
      {
        city: "Ciudad de México",
        count: 1,
        country: "Mexico",
        imageUrl: null,
        mix: "1 to eat",
        fact: "Marcus Lee goes 12 Nov",
      },
    ]);
  });

  it("uses the first name on score pills", () => {
    expect(firstName("Ana Ruiz")).toBe("Ana");
    expect(firstName(" Marcus ")).toBe("Marcus");
  });
});
