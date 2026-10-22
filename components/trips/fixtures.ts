// Test fixtures for the Trips board helpers.

import type { TripCard, TripsByStage } from "@/lib/trips/contracts";

export function tripCard(
  overrides: Partial<Omit<TripCard, "counts">> & { counts?: Partial<TripCard["counts"]> } = {},
): TripCard {
  const { counts, ...rest } = overrides;
  return {
    id: "trip-1",
    title: "Lisbon for Ana",
    clientId: "client-1",
    clientName: "Ana Ruiz",
    clientAvatarUrl: null,
    destination: { name: "Lisbon", lat: 38.72, lon: -9.14, radiusM: 12000 },
    startDate: "2027-05-14",
    endDate: "2027-05-18",
    datesMode: "exact",
    adults: 1,
    children: 0,
    stage: "planning",
    shareToken: null,
    seedStatus: "done",
    imageUrl: null,
    updatedAt: new Date("2026-10-01T10:00:00Z"),
    ...rest,
    counts: { places: 20, added: 6, filledSlots: 6, days: 5, emptyDays: 2, ...counts },
  };
}

export function board(cards: TripCard[]): TripsByStage {
  const grouped: TripsByStage = { planning: [], shared: [], traveling: [], done: [] };
  for (const card of cards) grouped[card.stage].push(card);
  return grouped;
}
