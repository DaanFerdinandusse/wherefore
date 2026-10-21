// The trips slice API, written once as types: trips, travelers, trip places,
// asks, itinerary slots and the provider call log. queries.ts and
// mutations.ts annotate every export with these.
//
// Ownership: a trip is in scope when its owner_id (or org_id) matches the
// caller. Children (trip places, asks, slots, calls) are reached through their
// trip, so every function takes the caller's scope too. Out of scope reads as
// null or throws NotFoundError.

import type { ScopeInput } from "@/lib/auth/scope";
import type { ListRecentClients } from "@/lib/clients/contracts";
import type {
  Ask,
  Category,
  Destination,
  Explainability,
  ItinerarySlot,
  SlotName,
  TasteTag,
  TripPlaceCard,
  TripPlaceSource,
  TripPlaceStatus,
  TripSnapshot,
  TripStage,
} from "@/lib/contracts";
import type { tripCalls, tripPlaces, trips, tripTravelers } from "@/lib/db/schema";

export type Trip = typeof trips.$inferSelect;
export type TripTraveler = typeof tripTravelers.$inferSelect;
export type TripPlace = typeof tripPlaces.$inferSelect;
export type TripCall = typeof tripCalls.$inferSelect;

export type TravelerInput = {
  clientId?: string | null;
  name: string;
  role: "client" | "guest";
  drivesSearch: boolean;
};

export type CreateTripInput = {
  clientId: string;
  destination: Destination;
  startDate?: string | null;
  endDate?: string | null;
  datesMode: "exact" | "unset";
  adults: number;
  children: number;
  /** The trip's client is added as the first traveler when missing. */
  travelers: TravelerInput[];
  /** Defaults to "<destination> for <client first name>". */
  title?: string;
};

export type CreatedTrip = { trip: Trip; chatId: string; travelers: TripTraveler[] };

/** One card on the Trips overview. */
export type TripCard = {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  clientAvatarUrl: string | null;
  destination: Destination;
  startDate: string | null;
  endDate: string | null;
  datesMode: string;
  adults: number;
  children: number;
  stage: TripStage;
  shareToken: string | null;
  seedStatus: string;
  /** First image of the trip's best scored place, for the city photo. */
  imageUrl: string | null;
  counts: {
    /** Trip places not removed. */
    places: number;
    /** Trip places in the itinerary. */
    added: number;
    filledSlots: number;
    days: number;
    /** Days without a single filled slot ("itinerary has 2 empty days"). */
    emptyDays: number;
  };
  updatedAt: Date;
};

export type TripsByStage = Record<TripStage, TripCard[]>;

export type TripPatch = Partial<
  Pick<Trip, "title" | "destination" | "startDate" | "endDate" | "adults" | "children" | "builtFrom"> & {
    datesMode: "exact" | "unset";
    seedStatus: TripSnapshot["trip"]["seedStatus"];
  }
>;

/** A trip place as the seed, an ask, the advisor or the UI writes it. */
export type TripPlaceUpsert = {
  placeId: string;
  source: TripPlaceSource;
  category: Category;
  bestAffinity?: number | null;
  /** 0..100 display score from its result set. */
  bestScore?: number | null;
  explainability?: Explainability;
  sharedTags?: TasteTag[];
  advisorPlaceId?: string | null;
  reason?: string | null;
  position?: number;
};

export type AskPlaceInput = {
  tripPlaceId: string;
  rank: number;
  affinity?: number | null;
  score?: number | null;
  explainability?: Explainability;
};

export type CreateAskInput = {
  label: string;
  query?: Record<string, unknown>;
  /** Idempotency key: a second create with the same tool call id returns the first ask. */
  toolCallId?: string | null;
  chatMessageId?: string | null;
  status?: Ask["status"];
};

export type AskPatch = Partial<{
  label: string;
  query: Record<string, unknown>;
  status: Ask["status"];
  resultCount: number;
  elapsedMs: number | null;
  loosened: string[];
}>;

export type SlotInput = {
  day: number;
  date?: string | null;
  slot: SlotName;
  tripPlaceId?: string | null;
  note?: string;
  position?: number;
};

export type SlotRejection = { tripPlaceId: string; reason: string };
export type SetSlotsResult = { applied: ItinerarySlot[]; rejected: SlotRejection[] };

export type TripCallInput = {
  endpoint: string;
  params?: Record<string, unknown>;
  count?: number;
  ms?: number;
  loosened?: string[];
  /** seed | ask:<id> | profile | manual */
  source?: string;
};

export type PastDestination = Destination & { lastTripId: string; lastStartDate: string | null; tripCount: number };

// Queries

export type GetTrip = (id: string, scope: ScopeInput) => Promise<Trip | null>;
export type GetTripSnapshot = (tripId: string, ownerId: ScopeInput) => Promise<TripSnapshot | null>;
/** The public traveler view by share token. No scope: the token is the key. */
export type GetSharedTripSnapshot = (
  token: string,
) => Promise<{ snapshot: TripSnapshot; advisorName: string | null } | null>;
export type ListTrips = (ownerId: ScopeInput) => Promise<TripsByStage>;
/** Cards for some or all of a trip's places, for tool outputs that stream cards. */
export type ListTripPlaceCards = (
  tripId: string,
  scope: ScopeInput,
  options?: { tripPlaceIds?: string[]; placeIds?: string[] },
) => Promise<TripPlaceCard[]>;
export type ListRecentClientsForTripBar = ListRecentClients;
/** Where the client went before, most recent first, one row per destination name. */
export type ClientPastDestinations = (clientId: string, scope: ScopeInput) => Promise<PastDestination[]>;
export type ListTripCalls = (tripId: string, scope: ScopeInput) => Promise<TripCall[]>;

// Mutations

/** Inserts the trip, its chat and its travelers in one batch; trips.chat_id is set. */
export type CreateTrip = (ownerId: ScopeInput, input: CreateTripInput) => Promise<CreatedTrip>;
export type UpdateTrip = (id: string, patch: TripPatch, scope: ScopeInput) => Promise<Trip>;
/** Creates the share token once; calling again keeps the same link. */
export type SetShareToken = (id: string, scope: ScopeInput) => Promise<Trip>;
export type RevokeShare = (id: string, scope: ScopeInput) => Promise<Trip>;
/** A drag on the Trips board. Null returns the trip to its computed stage. */
export type SetStageOverride = (id: string, stage: TripStage | null, scope: ScopeInput) => Promise<Trip>;

/**
 * Insert or merge trip places, unique on (trip, place). On a repeat the
 * stronger source wins (seed < ask < advisor < manual), the best score is
 * kept with its explainability and tags, status and position are left alone.
 * Returns `{ [placeId]: tripPlaceId }`.
 */
export type UpsertTripPlaces = (
  tripId: string,
  rows: TripPlaceUpsert[],
  scope: ScopeInput,
) => Promise<Record<string, string>>;
/** "Removed" also empties any slot holding the place. */
export type SetTripPlaceStatus = (
  tripPlaceId: string,
  status: TripPlaceStatus,
  scope: ScopeInput,
) => Promise<TripPlace>;

export type CreateAsk = (tripId: string, input: CreateAskInput, scope: ScopeInput) => Promise<Ask>;
export type UpdateAsk = (askId: string, patch: AskPatch, scope: ScopeInput) => Promise<Ask>;
export type ArchiveAsk = (askId: string, scope: ScopeInput) => Promise<Ask>;
/**
 * Add ranked results to an ask tab and update its result count. Trip places
 * of another trip are skipped and returned in `rejected`.
 */
export type AddAskPlaces = (
  askId: string,
  rows: AskPlaceInput[],
  scope: ScopeInput,
) => Promise<{ added: number; rejected: string[] }>;

/**
 * Write itinerary slots. `replace` clears the trip's slots first; `merge`
 * upserts on (day, slot, position) and keeps a stored note when the new one
 * is empty. Slots naming a trip place outside this trip (or a removed one)
 * are not written and come back in `rejected`. Trip place statuses follow:
 * in a slot means "added", otherwise "suggested".
 */
export type SetSlots = (
  tripId: string,
  slots: SlotInput[],
  mode: "replace" | "merge",
  scope: ScopeInput,
) => Promise<SetSlotsResult>;
/** One slot; throws InvalidInputError for a trip place outside the trip. */
export type UpsertSlot = (tripId: string, slot: SlotInput, scope: ScopeInput) => Promise<ItinerarySlot>;
export type ClearSlot = (slotId: string, scope: ScopeInput) => Promise<void>;

export type LogTripCall = (tripId: string, call: TripCallInput, scope: ScopeInput) => Promise<TripCall>;
