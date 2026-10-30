// The demo workspace as plain data: who the clients are, what they love, the
// advisor's own places and the four trips. scripts/seed-demo.ts resolves every
// name live, so no entity id is written here. Pure, safe to import anywhere.

import type { ClientStatus } from "@/lib/clients/contracts";
import type { SlotName } from "@/lib/contracts";

/** Which locality candidate to keep. Default: the first one the search returns. */
export type LocalitySpec = {
  query: string;
  /** Keep the first candidate whose disambiguation starts with this. */
  disambiguationStartsWith?: string;
};

/** A real place, looked up by name near a city. */
export type PlaceSpec = {
  /** What the advisor typed, and the name the match is checked against. */
  name: string;
  /** Searches to try in order when the name alone finds the wrong place. */
  searches?: string[];
};

export type ClientSpec = {
  name: string;
  home: LocalitySpec;
  /** The home city as the client profile shows it. */
  homeCity: string;
  status: ClientStatus;
  notes: string;
  groundRules: string[];
  favorites: PlaceSpec[];
  media: { query: string; kind: "artist" | "movie" | "book" }[];
};

export type AdvisorPlaceSpec = PlaceSpec & { note: string };

export type AdvisorCitySpec = { locality: LocalitySpec; places: AdvisorPlaceSpec[] };

/** Trip dates, relative to the day the seed runs so the stages stay right. */
export type TripDatesSpec =
  | { kind: "fixed"; start: string; end: string }
  /** Day `startDay` of next month, for `nights` nights. */
  | { kind: "next-month"; startDay: number; nights: number }
  /** Started `daysBefore` days ago, ends `daysAfter` days from today. */
  | { kind: "around-today"; daysBefore: number; daysAfter: number }
  /** The same calendar dates, one year back. */
  | { kind: "last-year"; month: number; day: number; nights: number };

export type DemoSlot = { day: number; slot: SlotName; pick: SlotPick; note?: string };

/** Which trip place fills a slot: the nth seed result of a category, or one of the advisor's places by name. */
export type SlotPick = { category: "eat" | "drink"; index: number } | { advisorPlace: string };

export type TripSpec = {
  title: string;
  client: string;
  destination: LocalitySpec;
  dates: TripDatesSpec;
  adults: number;
  children: number;
  guests: string[];
  share: boolean;
  /** Fill the board directly (eat and drink results) instead of leaving it to the agent's seed turn. */
  populate?: { take: number; slots: DemoSlot[] };
};

export const DEMO_ADVISOR = { displayName: "Daan", homeCity: "Amsterdam" } as const;

const LISBON: LocalitySpec = { query: "Lisbon" };
const MEXICO_CITY: LocalitySpec = { query: "Mexico City" };
const PARIS: LocalitySpec = { query: "Paris" };

export const DEMO_CLIENTS: ClientSpec[] = [
  {
    name: "Ana Ruiz",
    home: { query: "New York", disambiguationStartsWith: "New York, New York" },
    homeCity: "New York",
    status: "active",
    notes:
      "Met through Clara. Loves a long lunch and a short wine list. Books late, so keep two options per evening.",
    groundRules: ["No tasting menus", "Walks everywhere"],
    favorites: [{ name: "Via Carota" }, { name: "Lilia" }, { name: "Attaboy" }, { name: "Devoción" }],
    media: [{ query: "Khruangbin", kind: "artist" }],
  },
  {
    name: "Marcus Lee",
    home: { query: "London" },
    homeCity: "London",
    status: "active",
    notes: "Travels for work and adds a weekend. Early riser, coffee before anything else.",
    groundRules: ["Counter seats over tables"],
    favorites: [
      { name: "St. John" },
      { name: "Bar Termini" },
      { name: "Monmouth Coffee" },
      { name: "Rochelle Canteen" },
    ],
    media: [],
  },
  {
    name: "Sofia Haddad",
    home: PARIS,
    homeCity: "Paris",
    status: "active",
    notes: "Food writer. Wants the rooms locals book, not the ones on every list.",
    groundRules: ["Dinner after 9 pm"],
    favorites: [
      { name: "Le Châteaubriand" },
      { name: "Clamato" },
      { name: "Septime La Cave" },
      { name: "Ten Belles" },
    ],
    media: [],
  },
  {
    name: "Lena Okafor",
    home: { query: "Berlin" },
    homeCity: "Berlin",
    status: "active",
    notes: "New client, referred by Marcus. Still building her list.",
    groundRules: [],
    // "Mel's" has no match near Berlin on purpose: it shows the no-match tile.
    favorites: [{ name: "Nobelhart & Schmutzig" }, { name: "The Barn" }, { name: "Mel's" }],
    media: [],
  },
];

export const DEMO_ADVISOR_PLACES: AdvisorCitySpec[] = [
  {
    locality: LISBON,
    places: [
      { name: "Prado", note: "Book lunch, not dinner. Order from the board." },
      { name: "Taberna da Rua das Flores", note: "No bookings. Put your name down and wait with a glass outside." },
      { name: "BAHR", note: "Sunset drinks on the terrace, ask for the edge tables." },
      { name: "Fábrica Coffee Roasters", note: "First stop on day one, flat white and a pastry." },
      { name: "Comida Independente", note: "Ask for the corner table and let them pick the wine." },
      { name: "Senhor Uva", note: "Small plates and natural wine. Go before 8 pm." },
      { name: "Black Sheep", note: "A slow evening. Sit at the bar." },
      { name: "Cervejaria Ramiro", note: "Go before 1 pm or expect a queue." },
      { name: "Pastelaria Alcôa", searches: ["Pastelaria Alcôa", "Alcôa"], note: "Take two, eat one on the walk." },
      { name: "Zé da Mouraria", note: "Lunch only. Portions are big, share one dish." },
      { name: "A Cevicheria", note: "Sit at the counter for a quick early dinner." },
    ],
  },
  {
    locality: MEXICO_CITY,
    places: [
      { name: "Contramar", note: "Lunch only, go before 1 pm." },
      { name: "Rosetta", searches: ["Restaurante Rosetta", "Rosetta"], note: "Book a week out, ask for the front room." },
      { name: "Licorería Limantour", note: "Go early on a weekday, it fills up by 9 pm." },
      { name: "Máximo Bistrot", note: "Dinner. Ask for the window table." },
      { name: "Buna", note: "Coffee first thing, then walk Roma." },
      { name: "Lardo", note: "Breakfast at the bar, walk-ins are fine." },
    ],
  },
];

export const DEMO_TRIPS: TripSpec[] = [
  {
    title: "Lisbon for Ana",
    client: "Ana Ruiz",
    destination: LISBON,
    dates: { kind: "fixed", start: "2027-05-14", end: "2027-05-18" },
    adults: 2,
    children: 0,
    guests: ["Clara"],
    share: false,
  },
  {
    title: "Mexico City for Marcus",
    client: "Marcus Lee",
    destination: MEXICO_CITY,
    dates: { kind: "next-month", startDay: 12, nights: 4 },
    adults: 1,
    children: 0,
    guests: [],
    share: true,
    populate: {
      take: 6,
      slots: [
        { day: 1, slot: "breakfast", pick: { advisorPlace: "Buna" } },
        { day: 1, slot: "lunch", pick: { advisorPlace: "Contramar" }, note: "Go before 1 pm." },
        { day: 1, slot: "dinner", pick: { category: "eat", index: 0 } },
        { day: 1, slot: "night", pick: { category: "drink", index: 0 } },
        { day: 2, slot: "breakfast", pick: { advisorPlace: "Lardo" } },
        { day: 2, slot: "lunch", pick: { category: "eat", index: 1 } },
        { day: 2, slot: "dinner", pick: { advisorPlace: "Rosetta" } },
        { day: 2, slot: "night", pick: { category: "drink", index: 1 } },
      ],
    },
  },
  {
    title: "Paris for Sofia",
    client: "Sofia Haddad",
    destination: PARIS,
    dates: { kind: "around-today", daysBefore: 1, daysAfter: 3 },
    adults: 2,
    children: 0,
    guests: [],
    share: false,
    populate: {
      take: 6,
      slots: [
        { day: 1, slot: "lunch", pick: { category: "eat", index: 0 } },
        { day: 1, slot: "dinner", pick: { category: "eat", index: 1 }, note: "Table at 9.30 pm." },
        { day: 1, slot: "night", pick: { category: "drink", index: 0 } },
        { day: 2, slot: "lunch", pick: { category: "eat", index: 2 } },
        { day: 2, slot: "dinner", pick: { category: "eat", index: 3 } },
        { day: 2, slot: "night", pick: { category: "drink", index: 1 } },
      ],
    },
  },
  {
    title: "Oaxaca for Ana",
    client: "Ana Ruiz",
    destination: { query: "Oaxaca", disambiguationStartsWith: "Oaxaca de Juárez" },
    dates: { kind: "last-year", month: 3, day: 6, nights: 4 },
    adults: 2,
    children: 0,
    guests: [],
    share: false,
  },
];
