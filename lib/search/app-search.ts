import "server-only";

import type { ScopeInput } from "@/lib/auth/scope";
import { clients, trips } from "@/lib/db/schema";
import { listAdvisorPlaces } from "@/lib/places/queries";

import { normalizeQuery, searchRows } from "./trgm";

// The app bar's grouped dropdown: clients, trips and saved places in one call.

export type AppSearchResults = {
  clients: { id: string; name: string; homeCity: string | null; avatarUrl: string | null; status: string }[];
  trips: {
    id: string;
    title: string;
    clientName: string;
    destinationName: string;
    startDate: string | null;
    endDate: string | null;
  }[];
  places: { id: string; placeId: string; name: string; city: string; imageUrl: string | null; note: string }[];
};

export const EMPTY_SEARCH: AppSearchResults = { clients: [], trips: [], places: [] };

export async function appSearch(scope: ScopeInput, q: string, limit = 5): Promise<AppSearchResults> {
  const query = normalizeQuery(q);
  if (!query) return EMPTY_SEARCH;
  const [clientRows, tripRows, placeRows] = await Promise.all([
    searchRows(clients, scope, query, limit),
    searchRows(trips, scope, query, limit),
    listAdvisorPlaces(scope, { q: query, limit }),
  ]);
  return {
    clients: clientRows.map((c) => ({
      id: c.id,
      name: c.name,
      homeCity: c.homeCity,
      avatarUrl: c.avatarUrl,
      status: c.status,
    })),
    trips: tripRows.map((t) => ({
      id: t.id,
      title: t.title,
      clientName: t.clientName,
      destinationName: t.destination.name,
      startDate: t.startDate,
      endDate: t.endDate,
    })),
    places: placeRows.map((p) => ({
      id: p.id,
      placeId: p.placeId,
      name: p.name,
      city: p.city,
      imageUrl: p.imageUrl,
      note: p.note,
    })),
  };
}
