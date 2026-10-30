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
  SharedTripView,
  SlotName,
  TasteTag,
  TripPlaceCard,
  TripPlaceSource,
  TripPlaceStatus,
  TripSnapshot,
  TripStage,
} from "@/lib/contracts";
import type { tripCalls, tripPlaces, trips, tripTravelers } from "@/lib/db/schema";

import type { TurnGuard } from "./turn-guard";

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
  /** The stage set by hand (a drag or "Move to"), null while the stage is computed. */
  stageOverride: TripStage | null;
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

/** One column of the Trips board: a page of cards, newest first. */
export type TripStageColumn = {
  trips: TripCard[];
  /** Every trip in this stage, not just this page. */
  total: number;
  /** More trips in this stage after this page (ask again with a larger `offset`). */
  hasMore: boolean;
};

export type TripsByStage = Record<TripStage, TripStageColumn>;

export type ListTripsOptions = {
  /** Cards per stage, default 30, at most 100. */
  perStage?: number;
  /** Skip this many cards in each stage, for "Show more". Default 0. */
  offset?: number;
  /**
   * Trips made by the dev fixtures ("Dev: " title prefix, lib/trips/dev.ts):
   * left out by default, or the only ones listed with "only".
   */
  dev?: "exclude" | "only";
};

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
  /** The signal set `bestAffinity` was scored against (signalSetHash). */
  signalHash?: string | null;
  explainability?: Explainability;
  sharedTags?: TasteTag[];
  advisorPlaceId?: string | null;
  reason?: string | null;
  position?: number;
};

/**
 * Options for a write an agent tool makes: with `turn`, the write lands only
 * while that turn holds the chat's lock and no stop was requested, checked
 * inside the statement (turn-guard.ts). A write the guard blocks throws
 * TurnLostError.
 */
export type WriteOptions = { turn?: TurnGuard };

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
  /** What an agent tool call already did, for a retried step (lib/agent/tools/find-places.ts). */
  checkpoint: Record<string, unknown> | null;
}>;

export type SlotInput = {
  day: number;
  date?: string | null;
  slot: SlotName;
  tripPlaceId?: string | null;
  note?: string;
  /** Show the note on the public traveler view. Written together with the note. */
  noteForTraveler?: boolean;
  /** Who wrote the note: the advisor (default) or the agent (never shown to the traveler). */
  noteSource?: "advisor" | "agent";
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
  /** Agent calls: a retried step rewrites the row with the same key instead of adding one. */
  key?: { toolCallId: string; step: string; index: number };
};

export type PastDestination = Destination & { lastTripId: string; lastStartDate: string | null; tripCount: number };

// Queries

export type GetTrip = (id: string, scope: ScopeInput) => Promise<Trip | null>;
export type GetTripSnapshot = (tripId: string, ownerId: ScopeInput) => Promise<TripSnapshot | null>;
/**
 * The public traveler view by share token. No scope: the token is the key, so
 * the result holds only what the traveler may see (see SharedTripView).
 */
export type GetSharedTripView = (token: string) => Promise<SharedTripView | null>;
/** The Trips board: each stage bounded to a page, newest first. */
export type ListTrips = (ownerId: ScopeInput, options?: ListTripsOptions) => Promise<TripsByStage>;
/** Cards for some or all of a trip's places, for tool outputs that stream cards. */
export type ListTripPlaceCards = (
  tripId: string,
  scope: ScopeInput,
  options?: { tripPlaceIds?: string[]; placeIds?: string[] },
) => Promise<TripPlaceCard[]>;
export type ListRecentClientsForTripBar = ListRecentClients;
/** One photo per advisor city (any case), for the New trip city cards. */
export type TripBarCityImages = (scope: ScopeInput) => Promise<{ city: string; imageUrl: string }[]>;
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
 * An `advisorPlaceId` is kept only when that saved place is in the caller's
 * scope and saves the same `placeId`; otherwise the link is stored as null.
 * Returns `{ [placeId]: tripPlaceId }`.
 */
export type UpsertTripPlaces = (
  tripId: string,
  rows: TripPlaceUpsert[],
  scope: ScopeInput,
  options?: WriteOptions,
) => Promise<Record<string, string>>;
/** "Removed" also empties any slot holding the place. */
export type SetTripPlaceStatus = (
  tripPlaceId: string,
  status: TripPlaceStatus,
  scope: ScopeInput,
  options?: WriteOptions,
) => Promise<TripPlace>;

/** With a turn guard the ask records the turn (trip_asks.turn_id): finishing the turn finishes it. */
export type CreateAsk = (tripId: string, input: CreateAskInput, scope: ScopeInput, options?: WriteOptions) => Promise<Ask>;
export type UpdateAsk = (askId: string, patch: AskPatch, scope: ScopeInput, options?: WriteOptions) => Promise<Ask>;
export type ArchiveAsk = (askId: string, scope: ScopeInput) => Promise<Ask>;
/**
 * Add ranked results to an ask tab. Trip places of another trip are skipped
 * and returned in `rejected`. The result count is counted on read; the stored
 * `result_count` is written once, by `updateAsk` when the ask completes.
 */
export type AddAskPlaces = (
  askId: string,
  rows: AskPlaceInput[],
  scope: ScopeInput,
  /** `replace`: the rows are the ask's whole result set; other ask_places rows of the ask go. */
  options?: WriteOptions & { replace?: boolean },
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
  options?: WriteOptions,
) => Promise<SetSlotsResult>;
/** One slot; throws InvalidInputError for a trip place outside the trip. */
export type UpsertSlot = (tripId: string, slot: SlotInput, scope: ScopeInput) => Promise<ItinerarySlot>;
export type ClearSlot = (slotId: string, scope: ScopeInput) => Promise<void>;

export type LogTripCall = (
  tripId: string,
  call: TripCallInput,
  scope: ScopeInput,
  options?: WriteOptions,
) => Promise<TripCall>;
