// The New trip draft: a pure reducer, the bar's segment summaries and the
// request body. The panel holds one draft in useReducer; nothing here touches
// the network, so the rules are tested on their own.

import type { Destination } from "@/lib/contracts";
import type { DateRange } from "@/lib/ui/dates";

import { firstName, tripDatesLabel } from "@/components/trips/format";

import type { CreateTripRequest } from "./request";

export type DraftClient = {
  id: string;
  name: string;
  homeCity: string | null;
  avatarUrl: string | null;
  favoritesCount: number;
};

export type DraftGuest = {
  /** Local key; stable while the panel is open. */
  key: string;
  name: string;
  /** A client row (existing client or a guest profile made from the bar). */
  clientId: string | null;
  favoritesCount: number;
};

export type Draft = {
  client: DraftClient | null;
  destination: Destination | null;
  datesMode: "exact" | "unset";
  range: DateRange;
  guests: DraftGuest[];
  adults: number;
  children: number;
  /** Once the advisor sets adults by hand, adding a guest leaves the count alone. */
  adultsTouched: boolean;
};

export type DraftAction =
  | { type: "setClient"; client: DraftClient | null }
  | { type: "setDestination"; destination: Destination | null }
  | { type: "setRange"; range: DateRange }
  | { type: "setDatesMode"; mode: Draft["datesMode"] }
  | { type: "clearDates" }
  | { type: "addGuest"; guest: DraftGuest }
  | { type: "updateGuest"; key: string; patch: Partial<Omit<DraftGuest, "key">> }
  | { type: "removeGuest"; key: string }
  | { type: "setAdults"; value: number }
  | { type: "setChildren"; value: number };

export const MAX_TRAVELERS = 20;

export function initialDraft(client: DraftClient | null = null): Draft {
  return {
    client,
    destination: null,
    datesMode: "exact",
    range: {},
    guests: [],
    adults: 1,
    children: 0,
    adultsTouched: false,
  };
}

function autoAdults(draft: Draft, guests: DraftGuest[]): number {
  if (draft.adultsTouched) return Math.max(draft.adults, 1);
  return Math.min(MAX_TRAVELERS, Math.max(1, 1 + guests.length));
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "setClient": {
      // The client cannot also be a guest.
      const guests = action.client ? draft.guests.filter((g) => g.clientId !== action.client?.id) : draft.guests;
      return { ...draft, client: action.client, guests, adults: autoAdults(draft, guests) };
    }
    case "setDestination":
      return { ...draft, destination: action.destination };
    case "setRange":
      return { ...draft, range: action.range, datesMode: "exact" };
    case "setDatesMode":
      return { ...draft, datesMode: action.mode };
    case "clearDates":
      return { ...draft, range: {} };
    case "addGuest": {
      const name = action.guest.name.trim();
      if (!name) return draft;
      const { clientId } = action.guest;
      if (clientId && (clientId === draft.client?.id || draft.guests.some((g) => g.clientId === clientId))) {
        return draft;
      }
      const guests = [...draft.guests, { ...action.guest, name }];
      return { ...draft, guests, adults: autoAdults(draft, guests) };
    }
    case "updateGuest":
      return {
        ...draft,
        guests: draft.guests.map((g) => (g.key === action.key ? { ...g, ...action.patch } : g)),
      };
    case "removeGuest": {
      const guests = draft.guests.filter((g) => g.key !== action.key);
      return { ...draft, guests, adults: autoAdults(draft, guests) };
    }
    case "setAdults":
      return { ...draft, adults: Math.max(1, Math.min(MAX_TRAVELERS, action.value)), adultsTouched: true };
    case "setChildren":
      return { ...draft, children: Math.max(0, Math.min(MAX_TRAVELERS, action.value)) };
  }
}

// Segment summaries: null means the segment shows its placeholder.

export function whoSummary(draft: Draft): string | null {
  return draft.client?.name ?? null;
}

export function whereSummary(draft: Draft): string | null {
  return draft.destination?.name ?? null;
}

export function whenSummary(draft: Draft): string | null {
  if (draft.datesMode === "unset") return "Not set yet";
  return tripDatesLabel(draft.range.start, draft.range.end);
}

/** "Ana", "Ana and Clara", "Ana and 2 more". */
export function travelersSummary(draft: Draft): string | null {
  const names = [...(draft.client ? [draft.client.name] : []), ...draft.guests.map((g) => g.name)].map(firstName);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]} and ${names.length - 1} more`;
}

/** Create trip is enabled once who and where are set. */
export function canCreate(draft: Draft): boolean {
  return Boolean(draft.client && draft.destination);
}

/** Guests whose taste will not shape the search (no profile, or no favorites yet). */
export function guestsWithoutFavorites(draft: Draft): DraftGuest[] {
  return draft.guests.filter((g) => !g.clientId || g.favoritesCount === 0);
}

/**
 * The POST /api/trips body. Dates go as exact once a first day is picked (a
 * single day is a one day trip); otherwise the trip starts with "Not set yet".
 */
export function toCreateTripRequest(draft: Draft): CreateTripRequest | null {
  if (!draft.client || !draft.destination) return null;
  const start = draft.datesMode === "exact" ? draft.range.start : undefined;
  const end = start ? (draft.range.end ?? start) : undefined;
  return {
    clientId: draft.client.id,
    destination: draft.destination,
    datesMode: start ? "exact" : "unset",
    startDate: start ?? null,
    endDate: end ?? null,
    adults: draft.adults,
    children: draft.children,
    guests: draft.guests.map((g) => ({ name: g.name, clientId: g.clientId })),
  };
}
