"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { requireUser } from "@/lib/auth/server";
import { createClient, listClients, type ClientSummary } from "@/lib/clients";
import { selectClientSummaries } from "@/lib/clients/queries";
import type { TripStage } from "@/lib/contracts";
import { clients } from "@/lib/db/schema";
import { advisorCities } from "@/lib/places";

import { clientPastDestinations, listRecentClientsForTripBar, setStageOverride, tripBarCityImages } from "./index";
import type { PastDestination } from "./contracts";
import { computeStage, isTripStage } from "./stage";

// Server actions for the Trips board and the New trip panel. Every action
// starts with requireUser() and validates its input; reads are scoped to the
// signed-in advisor through the data slices.

const uuid = z.uuid();

export type TripBarClient = {
  id: string;
  name: string;
  homeCity: string | null;
  avatarUrl: string | null;
  favoritesCount: number;
  /** Photos of the first favorites that have one, in favorite order. */
  favoriteImages: string[];
  nextTrip: { id: string; title: string; startDate: string | null } | null;
};

export type TripBarContext = {
  recentClients: TripBarClient[];
  /** The client from `?client=<id>`, when it is the advisor's. */
  prefill: TripBarClient | null;
  /** Advisor cities with place counts, most first. */
  cities: { city: string; count: number }[];
  /** Where the prefilled client went before. */
  pastDestinations: PastDestination[];
  /** One photo per advisor city, for the city cards. */
  cityImages: { city: string; imageUrl: string }[];
};

function toTripBarClient(summary: ClientSummary): TripBarClient {
  return {
    id: summary.id,
    name: summary.name,
    homeCity: summary.homeCity,
    avatarUrl: summary.avatarUrl,
    favoritesCount: summary.favoritesCount,
    favoriteImages: summary.favoriteImages,
    nextTrip: summary.nextTrip,
  };
}

/** Everything the panel shows before the advisor types: recent clients, cities, the prefill. */
export async function loadTripBarContext(input: { clientId?: string | null }): Promise<TripBarContext> {
  const user = await requireUser();
  const clientId = input.clientId && uuid.safeParse(input.clientId).success ? input.clientId : null;

  const [recent, cities, prefillRows, pastDestinations, cityImages] = await Promise.all([
    listRecentClientsForTripBar(user, 4),
    advisorCities(user),
    clientId
      ? selectClientSummaries(user, eq(clients.id, clientId), { limit: 1 })
      : Promise.resolve([]),
    clientId ? clientPastDestinations(clientId, user) : Promise.resolve([]),
    tripBarCityImages(user),
  ]);
  const prefill = prefillRows[0] ? toTripBarClient(prefillRows[0]) : null;

  return { recentClients: recent.map(toTripBarClient), prefill, cities, pastDestinations, cityImages };
}

const searchSchema = z.string().trim().min(1).max(80);

/** "Find a client" and "Add a traveler": clients by name or home city, best match first. */
export async function searchTripBarClients(q: string): Promise<TripBarClient[]> {
  const user = await requireUser();
  const parsed = searchSchema.safeParse(q);
  if (!parsed.success) return [];
  const rows = await listClients(user, { q: parsed.data, limit: 8 });
  return rows.map(toTripBarClient);
}

/** "<Client> went before" for a client picked in the bar. */
export async function loadPastDestinations(clientId: string): Promise<PastDestination[]> {
  const user = await requireUser();
  if (!uuid.safeParse(clientId).success) return [];
  return clientPastDestinations(clientId, user);
}

const guestNameSchema = z.string().trim().min(1).max(80);

/**
 * "Add favorites" on a companion: a client row with status guest, so the
 * favorites picker on the client screen has somewhere to save.
 */
export async function createGuestClient(name: string): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const parsed = guestNameSchema.parse(name);
  const client = await createClient({ name: parsed, status: "guest" }, user);
  return { id: client.id, name: client.name };
}

export type MoveTripResult = { ok: true; stage: TripStage } | { ok: false; error: string };

/** "Reset to computed stage" in the card menu: drops the override, returns the stage the trip lands in. */
export async function resetTripStage(tripId: string): Promise<MoveTripResult> {
  const user = await requireUser();
  if (!uuid.safeParse(tripId).success) return { ok: false, error: "That trip does not exist." };
  try {
    const trip = await setStageOverride(tripId, null, user);
    return { ok: true, stage: computeStage(trip) };
  } catch {
    return { ok: false, error: "Could not reset the stage. Try again." };
  }
}

/** A drag on the Trips board, or "Move to ..." in the card menu. */
export async function moveTripToStage(tripId: string, stage: TripStage): Promise<MoveTripResult> {
  const user = await requireUser();
  if (!uuid.safeParse(tripId).success || !isTripStage(stage)) {
    return { ok: false, error: "That trip or stage does not exist." };
  }
  try {
    await setStageOverride(tripId, stage, user);
    return { ok: true, stage };
  } catch {
    return { ok: false, error: "Could not move the trip. Try again." };
  }
}
