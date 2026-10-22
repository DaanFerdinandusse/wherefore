// Shared types between the server, the agent tools and the UI. Every agent
// working in parallel codes against these. Change them only with a note in
// AGENTS.md and a ping to the other owners.

import type { UIMessage } from "ai";

export type Category = "eat" | "drink" | "coffee" | "see" | "stay" | "other";
export type TripPlaceSource = "seed" | "ask" | "advisor" | "manual";
export type TripPlaceStatus = "suggested" | "added" | "removed";
export type SlotName = "morning" | "lunch" | "afternoon" | "dinner" | "night" | "stay";
export type TripStage = "planning" | "shared" | "traveling" | "done";

export type TasteTag = { tagId: string; name: string; type?: string; score?: number };
export type PlaceTag = { tagId: string; name: string; type?: string };
export type PlaceImage = { url: string; width?: number; height?: number; source?: string };
export type MediaFavorite = {
  query: string;
  kind: "artist" | "movie" | "book";
  entityId?: string;
  name?: string;
  /** The provider image, for the "Also into" chip. */
  imageUrl?: string;
};
export type FavoriteCandidate = {
  entityId: string;
  name: string;
  address?: string;
  lat?: number;
  lon?: number;
  imageUrl?: string;
};

// Per client favorite: how much it drove a recommendation. Shares are integer
// percentages that sum to 100 within one result.
export type Explainability = { entityId: string; name: string; share: number }[];

export type Destination = {
  name: string;
  disambiguation?: string;
  countryCode?: string;
  lat: number;
  lon: number;
  radiusM: number;
  localityEntityId?: string;
};

export type BuiltFrom = {
  favorites: { clientName: string; names: string[] }[];
  advisorPlaceCount: number;
  companionsWithoutFavorites: string[];
  rules: string[];
};

// What a board card, a map pin and a chat tile all render from.
export type TripPlaceCard = {
  tripPlaceId: string;
  placeId: string;
  entityId: string;
  name: string;
  category: Category;
  neighborhood?: string;
  address?: string;
  lat?: number;
  lon?: number;
  imageUrl?: string;
  score?: number;
  because: Explainability;
  sharedTags: TasteTag[];
  yourPlace?: { advisorPlaceId: string; note: string };
  reason?: string;
  status: TripPlaceStatus;
  source: TripPlaceSource;
  askIds: string[];
};

export type Ask = {
  id: string;
  label: string;
  status: "running" | "done" | "failed" | "archived";
  resultCount: number;
  elapsedMs?: number;
  toolCallId?: string;
  loosened: string[];
};

export type ItinerarySlot = {
  id: string;
  day: number;
  date?: string;
  slot: SlotName;
  tripPlaceId?: string;
  note: string;
  /** The note shows on the public traveler view ("From your advisor") only when true. */
  noteForTraveler?: boolean;
  /** "agent": written by the agent. Shown to the advisor as "Agent note", never to the traveler. */
  noteSource?: "advisor" | "agent";
  position: number;
};

// The public traveler view (/s/[token]). Only what the traveler sees: no ids,
// no asks, no removed places, no private advisor place notes, no scores.
export type SharedTripPlace = {
  name: string;
  category: Category;
  imageUrl?: string;
  neighborhood?: string;
  /** "Because you love Via Carota and Lilia": the favorite names and their shares. */
  because: { name: string; share: number }[];
  sharedTags: string[];
  reason?: string;
};

export type SharedTripSlot = {
  slot: SlotName;
  position: number;
  place?: SharedTripPlace;
  /** Present only when the advisor marked the slot note for the traveler. */
  advisorNote?: string;
};

export type SharedTripDay = { day: number; date?: string; slots: SharedTripSlot[] };

export type SharedTripView = {
  title: string;
  destinationName: string;
  startDate?: string;
  endDate?: string;
  /** The trip client's first name, for "Prepared for Ana". */
  preparedFor: string;
  advisorName: string | null;
  days: SharedTripDay[];
};

// The snapshot a trip page loads on the server and the store starts from.
export type TripSnapshot = {
  trip: {
    id: string;
    title: string;
    clientId: string;
    clientName: string;
    destination: Destination;
    startDate?: string;
    endDate?: string;
    datesMode: "exact" | "unset";
    stage: TripStage;
    shareToken?: string;
    seedStatus: "pending" | "running" | "done" | "failed";
    builtFrom?: BuiltFrom;
    chatId: string;
  };
  travelers: { id: string; name: string; role: "client" | "guest"; clientId?: string; favoritesCount: number }[];
  places: TripPlaceCard[];
  asks: Ask[];
  slots: ItinerarySlot[];
};

// Tool phases streamed as preliminary outputs while a tool runs.
export type ToolPhase = "searching" | "scoring" | "explaining" | "done";

/** One line under the search card's tiles ("Score your places", "Explain picks"). */
export type ToolStepState = "pending" | "running" | "done" | "skipped" | "failed";
export type ToolStep = {
  key: "search" | "score" | "explain";
  label: string;
  /** "Your 3 Lisbon places, scored for Ana". */
  detail?: string;
  state: ToolStepState;
  done?: number;
  total?: number;
  /** Right-hand figure: "2 kept · 0.8 s", "3 of 5". */
  note?: string;
};

/** What the seed tool hands the model for the first message (PLAN 8). */
export type SeedSummary = {
  clientName: string;
  destination: string;
  total: number;
  categories: { category: Category; count: number }[];
  favoritesUsed: { clientName: string; names: string[] }[];
  advisorPlaces: { name: string; score?: number; onBoard: boolean }[];
  companionsWithoutFavorites: string[];
  rules: string[];
  explained: number;
  askNext: string[];
};

export type FindPlacesOutput = {
  phase: ToolPhase;
  askId?: string;
  label: string;
  count: number;
  total?: number;
  done?: number;
  elapsedMs: number;
  loosened: string[];
  places: TripPlaceCard[];
  error?: string;
  /** "ask" for find_places, "seed" for seed_trip. */
  kind?: "ask" | "seed";
  /** Card title: "Searched natural wine bars". */
  title?: string;
  /** Card details line: "Lisbon · based on Ana's favorites". */
  details?: string;
  /** Live line while running: "Searching places to eat · 3 of 5". */
  progress?: string;
  steps?: ToolStep[];
  /** Seed only, on the final output. */
  summary?: SeedSummary;
};

export type ScorePlacesOutput = {
  phase: ToolPhase;
  places: (Pick<TripPlaceCard, "tripPlaceId" | "placeId" | "name" | "score" | "because" | "yourPlace"> & {
    imageUrl?: string;
    /** The provider's id, for places scored by name that are not on the board. */
    entityId?: string;
    category?: Category;
  })[];
  /** Names that did not resolve to a place near the destination. */
  unresolved?: string[];
  error?: string;
};

/** lookup_place: the trimmed facts block of one place, nothing added. */
export type LookupPlaceOutput = {
  placeId: string;
  tripPlaceId?: string;
  name: string;
  address?: string;
  neighborhood?: string;
  priceLevel?: number;
  rating?: number;
  description?: string;
  descriptions?: string[];
  keywords?: string[];
  tags: string[];
  hours?: Record<string, string>;
  website?: string;
  phone?: string;
  error?: string;
};

/** remove_place: what was removed and the next best place that replaced it. */
export type RemovePlaceOutput = {
  removed?: Pick<TripPlaceCard, "tripPlaceId" | "placeId" | "name" | "category">;
  replacement?: TripPlaceCard;
  /** Why no replacement came back, in plain words. */
  note?: string;
  error?: string;
};

export type SetItineraryOutput = {
  applied: ItinerarySlot[];
  rejected: { placeId: string; reason: string }[];
};

export type TripContextOutput = {
  trip: TripSnapshot["trip"];
  travelers: {
    name: string;
    role: string;
    favorites: string[];
    tasteTags: string[];
    rules: string[];
    drivesSearch?: boolean;
  }[];
  advisorPlaces: { placeId: string; name: string; note: string; score?: number }[];
  board: { categories: { category: Category; count: number }[]; asks: Ask[] };
  itinerary: ItinerarySlot[];
  party?: { adults: number; children: number };
};

export type ChatMessageMetadata = {
  hidden?: boolean;
  kind?: "seed" | "turn";
  stopped?: boolean;
  turnId?: string;
  createdAt?: string;
};

export type AppDataParts = {
  // Fallback channel if preliminary tool outputs cannot stream (PLAN 6.4).
  "tool-progress": FindPlacesOutput & { toolCallId: string };
};

export type AppUIMessage = UIMessage<ChatMessageMetadata, AppDataParts>;

export type ChatSnapshot = {
  chat: {
    id: string;
    tripId: string;
    status: "idle" | "running" | "failed";
    activeRunId?: string;
    activeTurnId?: string;
    lastError?: string;
    messages: AppUIMessage[];
  };
};
