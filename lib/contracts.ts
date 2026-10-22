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
  position: number;
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
};

export type ScorePlacesOutput = {
  phase: ToolPhase;
  places: (Pick<TripPlaceCard, "tripPlaceId" | "placeId" | "name" | "score" | "because" | "yourPlace"> & {
    imageUrl?: string;
  })[];
};

export type SetItineraryOutput = {
  applied: ItinerarySlot[];
  rejected: { placeId: string; reason: string }[];
};

export type TripContextOutput = {
  trip: TripSnapshot["trip"];
  travelers: { name: string; role: string; favorites: string[]; tasteTags: string[]; rules: string[] }[];
  advisorPlaces: { placeId: string; name: string; note: string; score?: number }[];
  board: { category: Category; count: number }[] & { asks?: Ask[] };
  itinerary: ItinerarySlot[];
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
