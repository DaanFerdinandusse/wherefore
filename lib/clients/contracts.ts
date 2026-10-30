// The clients slice API, written once as types. queries.ts and mutations.ts
// annotate every export with these, so a signature cannot drift from what the
// screens and the agent tools code against.
//
// Ownership: every function takes the caller's scope (a bare owner id works).
// Rows outside it read as null or throw NotFoundError, never as someone else's.

import type { ScopeInput } from "@/lib/auth/scope";
import type {
  FavoriteCandidate,
  MediaFavorite,
  TasteTag,
} from "@/lib/contracts";
import type { clientFavorites, clients } from "@/lib/db/schema";

export type Client = typeof clients.$inferSelect;
export type ClientFavorite = typeof clientFavorites.$inferSelect;
export type ClientStatus = "active" | "archived" | "guest";
export type FavoriteMatch = "resolved" | "unmatched" | "weak";

/** One row on the Clients page, the For who menu and the trip bar. */
export type ClientSummary = {
  id: string;
  name: string;
  homeCity: string | null;
  avatarUrl: string | null;
  status: ClientStatus;
  favoritesCount: number;
  /** All trips for this client, past and upcoming. */
  tripCount: number;
  /** First image of the first 4 favorites that have one, in favorite order. */
  favoriteImages: string[];
  /** The first 3 favorites by name: the matched place's name, else what the advisor typed. */
  favoriteNames: string[];
  tasteTags: TasteTag[];
  mediaFavorites: MediaFavorite[];
  /** The start of the advisor's notes, at most 240 characters. */
  notesExcerpt: string;
  /** The soonest trip that has not ended (or has no dates yet). */
  nextTrip: { id: string; title: string; startDate: string | null } | null;
  /** The later of the client's and their trips' last update. */
  lastActivityAt: Date;
  createdAt: Date;
};

/** A favorite with the place it resolved to, for the "places she loves" grid. */
export type FavoriteWithPlace = ClientFavorite & {
  place: {
    id: string;
    entityId: string;
    name: string;
    city: string | null;
    imageUrl: string | null;
    /** The provider's genre urn ("urn:tag:genre:place:restaurant:italian"), for the type under the photo. */
    primaryType: string | null;
  } | null;
};

export type ClientTripRow = {
  id: string;
  title: string;
  destinationName: string;
  startDate: string | null;
  endDate: string | null;
  datesMode: string;
};

export type ClientProfile = {
  client: Client;
  favorites: FavoriteWithPlace[];
  /** Upcoming first (soonest), then past (most recent first). */
  trips: { upcoming: ClientTripRow[]; past: ClientTripRow[] };
};

export type CreateClientInput = {
  name: string;
  homeCity?: string | null;
  homeLat?: number | null;
  homeLon?: number | null;
  email?: string | null;
  avatarUrl?: string | null;
  notes?: string;
  status?: ClientStatus;
  groundRules?: string[];
  mediaFavorites?: MediaFavorite[];
};

/** The fields the edit-in-place profile saves as you type. */
export type ClientFieldsPatch = Partial<
  Pick<Client, "name" | "homeCity" | "homeLat" | "homeLon" | "email" | "avatarUrl" | "notes"> & {
    status: ClientStatus;
  }
>;

export type AddFavoriteInput = {
  query: string;
  entityId?: string | null;
  placeId?: string | null;
  match: FavoriteMatch;
  candidates: FavoriteCandidate[];
};

export type FavoritePatch = Partial<AddFavoriteInput>;

// Queries

export type ListClients = (
  ownerId: ScopeInput,
  options?: { q?: string; includeArchived?: boolean; limit?: number },
) => Promise<ClientSummary[]>;
export type GetClient = (id: string, scope: ScopeInput) => Promise<Client | null>;
export type GetClientProfile = (id: string, scope: ScopeInput) => Promise<ClientProfile | null>;
export type ListFavorites = (clientId: string, scope: ScopeInput) => Promise<FavoriteWithPlace[]>;
/** The most recently active clients (status active), for the trip bar's For who menu. */
export type ListRecentClients = (ownerId: ScopeInput, limit?: number) => Promise<ClientSummary[]>;

// Mutations

export type CreateClient = (input: CreateClientInput, scope: ScopeInput) => Promise<Client>;
/** Saves a partial edit. Renaming also rewrites the client's trips' client_name and search. */
export type UpdateClientFields = (id: string, patch: ClientFieldsPatch, scope: ScopeInput) => Promise<Client>;
export type ArchiveClient = (id: string, scope: ScopeInput) => Promise<Client>;
export type AddFavorite = (clientId: string, input: AddFavoriteInput, scope: ScopeInput) => Promise<ClientFavorite>;
export type UpdateFavorite = (favoriteId: string, patch: FavoritePatch, scope: ScopeInput) => Promise<ClientFavorite>;
export type RemoveFavorite = (favoriteId: string, scope: ScopeInput) => Promise<void>;
/** Positions follow the order of `favoriteIds`; ids of other clients are ignored. */
export type ReorderFavorites = (clientId: string, favoriteIds: string[], scope: ScopeInput) => Promise<void>;
export type SetTasteTags = (clientId: string, tags: TasteTag[], scope: ScopeInput) => Promise<Client>;
export type SetGroundRules = (clientId: string, rules: string[], scope: ScopeInput) => Promise<Client>;
export type SetMediaFavorites = (clientId: string, media: MediaFavorite[], scope: ScopeInput) => Promise<Client>;

// Trip details for the Clients page and the client profile's Trips panel.

/** A trip as a card: the photo, the stage inputs and how full it is. */
export type ClientTripCard = ClientTripRow & {
  clientId: string;
  shareToken: string | null;
  stageOverride: string | null;
  /** First image of the trip's best place (added first, then by score). */
  imageUrl: string | null;
  /** Trip places the advisor added to the itinerary. */
  placeCount: number;
};

/** Cards for these trips, in the order of `tripIds`; ids out of scope are skipped. */
export type ListClientTripCards = (tripIds: string[], scope: ScopeInput) => Promise<ClientTripCard[]>;
/** Number of trips per client id; clients without trips are absent. */
export type CountClientTrips = (clientIds: string[], scope: ScopeInput) => Promise<Record<string, number>>;
