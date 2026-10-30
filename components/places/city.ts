// Pure rules for one city on My places: the category tabs and sections, the
// city tiles of "Change city" (count, country, photo, what kind of places,
// the one trip fact worth saying) and which client the city is scored for
// by default. No I/O and no server-only import, so the page, the client
// islands and the tests share one answer.

import type { Category } from "@/lib/contracts";

/** The fields of a saved place these rules read. */
export type CityPlaceFields = {
  city: string;
  category: Category;
  country: string | null;
  imageUrl: string | null;
};

/** A trip, as far as a city tile cares: who, where and when. */
export type CityTripFields = {
  clientId: string;
  clientName: string;
  city: string;
  /** YYYY-MM-DD or null. */
  startDate: string | null;
  endDate: string | null;
};

export function cityKey(city: string): string {
  return city.trim().toLocaleLowerCase("en");
}

export function sameCity(a: string, b: string): boolean {
  return cityKey(a) === cityKey(b);
}

/** "Ana Ruiz" reads "Ana" on score pills ("94 for Ana"). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// ---------------------------------------------------------------- categories

export type CategorySlug = "hotels" | "restaurants" | "bars" | "cafes" | "sights" | "other";
/** A tab slug, or the section that holds restaurants and bars together. */
export type CategoryFilter = CategorySlug | "restaurants-and-bars";

const TABS: { slug: CategorySlug; label: string; category: Category }[] = [
  { slug: "hotels", label: "Hotels", category: "stay" },
  { slug: "restaurants", label: "Restaurants", category: "eat" },
  { slug: "bars", label: "Bars", category: "drink" },
  { slug: "cafes", label: "Cafes", category: "coffee" },
  { slug: "sights", label: "Sights", category: "see" },
  { slug: "other", label: "Other", category: "other" },
];

/** Sections on "All", in order. Restaurants and bars share one. */
const SECTIONS: { key: CategoryFilter; categories: Category[] }[] = [
  { key: "hotels", categories: ["stay"] },
  { key: "restaurants-and-bars", categories: ["eat", "drink"] },
  { key: "cafes", categories: ["coffee"] },
  { key: "sights", categories: ["see"] },
  { key: "other", categories: ["other"] },
];

/** Cards a section shows on "All" before "All 6 hotels" takes over. */
export const SECTION_PREVIEW = 4;

export function parseCategory(value: string | null | undefined): CategoryFilter | null {
  const slug = value?.trim().toLowerCase();
  if (!slug) return null;
  if (slug === "restaurants-and-bars") return slug;
  return TABS.some((tab) => tab.slug === slug) ? (slug as CategorySlug) : null;
}

/** The categories a filter shows. */
export function categoriesOf(filter: CategoryFilter): Category[] {
  if (filter === "restaurants-and-bars") return ["eat", "drink"];
  const tab = TABS.find((t) => t.slug === filter);
  return tab ? [tab.category] : [];
}

export type CategoryTab = { slug: CategorySlug; label: string; count: number };

/** One tab per category the city actually has, with its count. */
export function categoryTabs(places: readonly Pick<CityPlaceFields, "category">[]): CategoryTab[] {
  return TABS.map((tab) => ({
    slug: tab.slug,
    label: tab.label,
    count: places.filter((p) => p.category === tab.category).length,
  })).filter((tab) => tab.count > 0);
}

/** Whether a tab is lit for the filter in the URL (both for "restaurants and bars"). */
export function tabIsActive(slug: CategorySlug, filter: CategoryFilter | null): boolean {
  if (!filter) return false;
  if (filter === "restaurants-and-bars") return slug === "restaurants" || slug === "bars";
  return slug === filter;
}

function sectionTitle(key: CategoryFilter, present: ReadonlySet<Category>): string {
  switch (key) {
    case "hotels":
      return "Hotels";
    case "restaurants":
      return "Restaurants";
    case "bars":
      return "Bars";
    case "restaurants-and-bars":
      if (present.has("eat") && present.has("drink")) return "Restaurants and bars";
      return present.has("drink") ? "Bars" : "Restaurants";
    case "cafes":
      return "Cafes";
    case "sights":
      return "Things to see";
    case "other":
      return "Other places";
  }
}

export type PlaceSection<T> = {
  key: CategoryFilter;
  title: string;
  places: T[];
  total: number;
  /** "All 6 hotels" and where it goes, when the preview leaves places out. */
  seeAll: { label: string; filter: CategoryFilter } | null;
};

/**
 * The sections for the filter in view. "All" shows every non-empty section
 * with its first four places and an "All N ..." link when there are more; a
 * filter shows its one section in full.
 */
export function placeSections<T extends Pick<CityPlaceFields, "category">>(
  places: readonly T[],
  filter: CategoryFilter | null,
): PlaceSection<T>[] {
  if (filter) {
    const categories = categoriesOf(filter);
    const shown = places.filter((p) => categories.includes(p.category));
    if (shown.length === 0) return [];
    const present = new Set(shown.map((p) => p.category));
    return [{ key: filter, title: sectionTitle(filter, present), places: [...shown], total: shown.length, seeAll: null }];
  }
  return SECTIONS.flatMap((section) => {
    const all = places.filter((p) => section.categories.includes(p.category));
    if (all.length === 0) return [];
    const title = sectionTitle(section.key, new Set(all.map((p) => p.category)));
    const more = all.length > SECTION_PREVIEW;
    return [
      {
        key: section.key,
        title,
        places: all.slice(0, SECTION_PREVIEW),
        total: all.length,
        seeAll: more ? { label: `All ${all.length} ${title.toLocaleLowerCase("en")}`, filter: section.key } : null,
      },
    ];
  });
}

// ---------------------------------------------------------------- city tiles

/** "6 hotels, 12 to eat, 2 to see": only the kinds the city has. */
export function mixLine(places: readonly Pick<CityPlaceFields, "category">[]): string | null {
  const count = (categories: Category[]) => places.filter((p) => categories.includes(p.category)).length;
  const hotels = count(["stay"]);
  const eat = count(["eat", "drink", "coffee"]);
  const see = count(["see"]);
  const parts = [
    hotels > 0 ? `${hotels} ${hotels === 1 ? "hotel" : "hotels"}` : null,
    eat > 0 ? `${eat} to eat` : null,
    see > 0 ? `${see} to see` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Nov" this year, "14 May 2027" in another. */
export function shortDay(iso: string, today: string): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const label = `${day} ${MONTHS[month - 1]}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${year}`;
}

/** "Sep 2024". */
export function monthYear(iso: string): string {
  const [year, month] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[month - 1]} ${year}`;
}

function tripsIn<T extends CityTripFields>(trips: readonly T[], city: string): T[] {
  return trips.filter((t) => sameCity(t.city, city));
}

function isThereNow(trip: CityTripFields, today: string): boolean {
  const end = trip.endDate ?? trip.startDate;
  return !!trip.startDate && trip.startDate <= today && !!end && today <= end;
}

function soonestUpcoming<T extends CityTripFields>(trips: readonly T[], today: string): T | undefined {
  return trips
    .filter((t) => t.startDate !== null && t.startDate > today)
    .sort((a, b) => (a.startDate as string).localeCompare(b.startDate as string))[0];
}

/**
 * The one thing worth saying about trips to a city: someone is there now,
 * someone goes soon, or when the last trip there ended. Null without dated
 * trips. Dates are YYYY-MM-DD, so string order is date order.
 */
export function cityFact(trips: readonly CityTripFields[], city: string, today: string): string | null {
  const here = tripsIn(trips, city);
  const now = here.find((t) => isThereNow(t, today));
  if (now) return `${now.clientName} is there now`;
  const next = soonestUpcoming(here, today);
  if (next?.startDate) return `${next.clientName} goes ${shortDay(next.startDate, today)}`;
  const ended = here
    .map((t) => t.endDate ?? t.startDate)
    .filter((end): end is string => end !== null && end < today)
    .sort()
    .at(-1);
  return ended ? `Last trip in ${monthYear(ended)}` : null;
}

/** Who the city is scored for when the URL does not say: the client there now, else the next to go. */
export function defaultClientId(trips: readonly CityTripFields[], city: string, today: string): string | null {
  const here = tripsIn(trips, city);
  return here.find((t) => isThereNow(t, today))?.clientId ?? soonestUpcoming(here, today)?.clientId ?? null;
}

/** Client ids with a trip to the city that has not ended (or has no dates), soonest first. */
export function clientsGoingTo(trips: readonly CityTripFields[], city: string, today: string): string[] {
  const live = tripsIn(trips, city)
    .filter((t) => {
      const end = t.endDate ?? t.startDate;
      return !end || end >= today;
    })
    .sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999"));
  return [...new Set(live.map((t) => t.clientId))];
}

/**
 * What the client picker says under a client with a trip to the city: "In
 * Lisboa now", "Goes 12 Nov", "Trip not dated yet". Null without a live trip.
 */
export function clientTripLine(
  trips: readonly CityTripFields[],
  clientId: string,
  city: string,
  today: string,
): string | null {
  const theirs = tripsIn(trips, city).filter((t) => t.clientId === clientId);
  if (theirs.some((t) => isThereNow(t, today))) return `In ${city.trim()} now`;
  const next = soonestUpcoming(theirs, today);
  if (next?.startDate) return `Goes ${shortDay(next.startDate, today)}`;
  if (theirs.some((t) => t.startDate === null)) return "Trip not dated yet";
  return null;
}

export type CitySummary = {
  city: string;
  count: number;
  country: string | null;
  imageUrl: string | null;
  /** "6 hotels, 12 to eat". */
  mix: string | null;
  /** "Ana Ruiz goes 12 Nov". */
  fact: string | null;
};

/**
 * One tile per city the advisor has places in, most places first. Cities
 * compare case-insensitively and keep the first spelling seen. The country
 * is the one most of its places are geocoded to; the photo is the first
 * place photo (places arrive newest first).
 */
export function citySummaries(
  places: readonly CityPlaceFields[],
  trips: readonly CityTripFields[],
  today: string,
): CitySummary[] {
  const groups = new Map<string, CityPlaceFields[]>();
  for (const place of places) {
    if (!place.city.trim()) continue;
    const key = cityKey(place.city);
    groups.set(key, [...(groups.get(key) ?? []), place]);
  }
  return [...groups.values()]
    .map((group): CitySummary => {
      const city = group[0].city.trim();
      const countries = new Map<string, number>();
      for (const p of group) if (p.country) countries.set(p.country, (countries.get(p.country) ?? 0) + 1);
      const country = [...countries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return {
        city,
        count: group.length,
        country,
        imageUrl: group.find((p) => p.imageUrl)?.imageUrl ?? null,
        mix: mixLine(group),
        fact: cityFact(trips, city, today),
      };
    })
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}
