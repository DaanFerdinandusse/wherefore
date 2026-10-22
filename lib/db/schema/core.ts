import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  BuiltFrom,
  Destination,
  Explainability,
  FavoriteCandidate,
  MediaFavorite,
  PlaceImage,
  PlaceTag,
  TasteTag,
} from "@/lib/contracts";

// Shared column sets. Every owned row carries owner_id (Neon Auth user id)
// and a nullable org_id for a later team list.
const ids = {
  id: uuid("id").primaryKey().defaultRandom(),
};

const owned = {
  ownerId: text("owner_id").notNull(),
  orgId: text("org_id"),
};

const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const advisors = pgTable(
  "advisors",
  {
    ...ids,
    ...owned,
    userId: text("user_id").notNull(),
    displayName: text("display_name").notNull(),
    homeCity: text("home_city"),
    tasteTags: jsonb("taste_tags").$type<TasteTag[]>().notNull().default([]),
    blendMyTaste: boolean("blend_my_taste").notNull().default(false),
    ...stamps,
  },
  (t) => [uniqueIndex("advisors_user_id_idx").on(t.userId)],
);

export const clients = pgTable(
  "clients",
  {
    ...ids,
    ...owned,
    name: text("name").notNull(),
    homeCity: text("home_city"),
    homeLat: doublePrecision("home_lat"),
    homeLon: doublePrecision("home_lon"),
    avatarUrl: text("avatar_url"),
    notes: text("notes").notNull().default(""),
    groundRules: jsonb("ground_rules").$type<string[]>().notNull().default([]),
    mediaFavorites: jsonb("media_favorites").$type<MediaFavorite[]>().notNull().default([]),
    tasteTags: jsonb("taste_tags").$type<TasteTag[]>().notNull().default([]),
    tasteTagsAt: timestamp("taste_tags_at", { withTimezone: true }),
    // active | archived | guest (a companion created from the travelers menu)
    status: text("status").notNull().default("active"),
    // Plain column filled by the write helpers: name + home city + notes.
    search: text("search").notNull().default(""),
    ...stamps,
  },
  (t) => [
    index("clients_owner_idx").on(t.ownerId, t.updatedAt),
    index("clients_search_trgm_idx").using("gin", sql`${t.search} gin_trgm_ops`),
  ],
);

export const clientFavorites = pgTable(
  "client_favorites",
  {
    ...ids,
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    // What the advisor typed or imported.
    query: text("query").notNull(),
    entityId: text("entity_id"),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    // resolved | unmatched | weak
    match: text("match").notNull().default("unmatched"),
    candidates: jsonb("candidates").$type<FavoriteCandidate[]>().notNull().default([]),
    position: integer("position").notNull().default(0),
    ...stamps,
  },
  (t) => [index("client_favorites_client_idx").on(t.clientId, t.position)],
);

// Cache of every place the app has touched. Not owned by anyone.
export const places = pgTable(
  "places",
  {
    ...ids,
    entityId: text("entity_id").notNull(),
    name: text("name").notNull(),
    address: text("address"),
    city: text("city"),
    neighborhood: text("neighborhood"),
    lat: doublePrecision("lat"),
    lon: doublePrecision("lon"),
    primaryType: text("primary_type"),
    types: jsonb("types").$type<string[]>().notNull().default([]),
    priceLevel: integer("price_level"),
    rating: numeric("rating", { precision: 3, scale: 2, mode: "number" }),
    ratingCount: integer("rating_count"),
    description: text("description"),
    images: jsonb("images").$type<PlaceImage[]>().notNull().default([]),
    tags: jsonb("tags").$type<PlaceTag[]>().notNull().default([]),
    // Raw properties block for the profile: hours, phone, website, keywords,
    // the long descriptions. Never shown without going through normalize.
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    googlePlaceId: text("google_place_id"),
    googleCid: text("google_cid"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
    ...stamps,
  },
  (t) => [
    uniqueIndex("places_entity_id_idx").on(t.entityId),
    index("places_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
    index("places_google_place_id_idx").on(t.googlePlaceId),
  ],
);

// My places: the advisor's own library, per city, with a private note.
export const advisorPlaces = pgTable(
  "advisor_places",
  {
    ...ids,
    ...owned,
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    city: text("city").notNull(),
    note: text("note").notNull().default(""),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    placeName: text("place_name").notNull(),
    search: text("search").notNull().default(""),
    ...stamps,
  },
  (t) => [
    uniqueIndex("advisor_places_owner_place_idx").on(t.ownerId, t.placeId),
    index("advisor_places_owner_city_idx").on(t.ownerId, t.city),
    index("advisor_places_search_trgm_idx").using("gin", sql`${t.search} gin_trgm_ops`),
  ],
);

export const trips = pgTable(
  "trips",
  {
    ...ids,
    ...owned,
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    destination: jsonb("destination").$type<Destination>().notNull(),
    startDate: date("start_date"),
    endDate: date("end_date"),
    // exact | unset
    datesMode: text("dates_mode").notNull().default("unset"),
    adults: integer("adults").notNull().default(1),
    children: integer("children").notNull().default(0),
    // The stage is computed (planning, shared, traveling, done). A drag on the
    // Trips board stores a manual override here.
    stageOverride: text("stage_override"),
    shareToken: text("share_token"),
    sharedAt: timestamp("shared_at", { withTimezone: true }),
    chatId: uuid("chat_id"),
    // pending | running | done | failed
    seedStatus: text("seed_status").notNull().default("pending"),
    builtFrom: jsonb("built_from").$type<BuiltFrom>(),
    clientName: text("client_name").notNull(),
    search: text("search").notNull().default(""),
    ...stamps,
  },
  (t) => [
    index("trips_owner_updated_idx").on(t.ownerId, t.updatedAt),
    uniqueIndex("trips_share_token_idx").on(t.shareToken),
    index("trips_search_trgm_idx").using("gin", sql`${t.search} gin_trgm_ops`),
  ],
);

export const tripTravelers = pgTable(
  "trip_travelers",
  {
    ...ids,
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    // client | guest
    role: text("role").notNull().default("guest"),
    drivesSearch: boolean("drives_search").notNull().default(false),
    position: integer("position").notNull().default(0),
    ...stamps,
  },
  (t) => [index("trip_travelers_trip_idx").on(t.tripId, t.position)],
);

// One board and map tab per agent ask ("Natural wine · Sat").
export const tripAsks = pgTable(
  "trip_asks",
  {
    ...ids,
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    query: jsonb("query").$type<Record<string, unknown>>().notNull().default({}),
    toolCallId: text("tool_call_id"),
    chatMessageId: text("chat_message_id"),
    // running | done | failed | archived
    status: text("status").notNull().default("running"),
    resultCount: integer("result_count").notNull().default(0),
    elapsedMs: integer("elapsed_ms"),
    loosened: jsonb("loosened").$type<string[]>().notNull().default([]),
    // The chat turn that runs the ask. Finishing the turn finishes its asks.
    turnId: text("turn_id"),
    // What the tool call already did (search results, scoring, explaining),
    // so a retried step resumes instead of searching again. Agent asks only.
    checkpoint: jsonb("checkpoint").$type<Record<string, unknown>>(),
    ...stamps,
  },
  (t) => [
    index("trip_asks_trip_idx").on(t.tripId, t.createdAt),
    uniqueIndex("trip_asks_tool_call_idx").on(t.toolCallId),
    index("trip_asks_turn_idx").on(t.turnId),
  ],
);

// One row per place per trip. Tab membership for asks lives in ask_places.
export const tripPlaces = pgTable(
  "trip_places",
  {
    ...ids,
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    // seed | ask | advisor | manual. Highest priority source wins.
    source: text("source").notNull(),
    // eat | drink | coffee | see | stay | other
    category: text("category").notNull().default("other"),
    bestAffinity: numeric("best_affinity", { precision: 6, scale: 4, mode: "number" }),
    bestScore: integer("best_score"),
    // The signal set (favorites and blended places) best_affinity was scored
    // against. Affinities are compared only within the same set.
    signalHash: text("signal_hash"),
    explainability: jsonb("explainability").$type<Explainability>().notNull().default([]),
    sharedTags: jsonb("shared_tags").$type<TasteTag[]>().notNull().default([]),
    advisorPlaceId: uuid("advisor_place_id").references(() => advisorPlaces.id, {
      onDelete: "set null",
    }),
    reason: text("reason"),
    // suggested | added | removed
    status: text("status").notNull().default("suggested"),
    position: integer("position").notNull().default(0),
    // A removed place's replacement, written with the replacement itself, and
    // the key (a tool call id) that asked for it: a retry returns the same one.
    replacedBy: uuid("replaced_by"),
    replacementKey: text("replacement_key"),
    ...stamps,
  },
  (t) => [
    uniqueIndex("trip_places_trip_place_idx").on(t.tripId, t.placeId),
    index("trip_places_trip_status_idx").on(t.tripId, t.status),
  ],
);

export const askPlaces = pgTable(
  "ask_places",
  {
    ...ids,
    askId: uuid("ask_id")
      .notNull()
      .references(() => tripAsks.id, { onDelete: "cascade" }),
    tripPlaceId: uuid("trip_place_id")
      .notNull()
      .references(() => tripPlaces.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    affinity: numeric("affinity", { precision: 6, scale: 4, mode: "number" }),
    score: integer("score"),
    explainability: jsonb("explainability").$type<Explainability>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("ask_places_ask_trip_place_idx").on(t.askId, t.tripPlaceId),
    index("ask_places_ask_rank_idx").on(t.askId, t.rank),
  ],
);

export const itinerarySlots = pgTable(
  "itinerary_slots",
  {
    ...ids,
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    day: integer("day").notNull(),
    date: date("date"),
    // morning | lunch | afternoon | dinner | night | stay
    slot: text("slot").notNull(),
    tripPlaceId: uuid("trip_place_id").references(() => tripPlaces.id, {
      onDelete: "set null",
    }),
    note: text("note").notNull().default(""),
    // The note shows on the public traveler view only when this is set.
    noteForTraveler: boolean("note_for_traveler").notNull().default(false),
    // advisor | agent. An agent note is for the advisor only: never shown to
    // the traveler unless the advisor rewrites it.
    noteSource: text("note_source").notNull().default("advisor"),
    position: integer("position").notNull().default(0),
    ...stamps,
  },
  (t) => [
    uniqueIndex("itinerary_slots_trip_day_slot_pos_idx").on(t.tripId, t.day, t.slot, t.position),
    index("itinerary_slots_trip_day_idx").on(t.tripId, t.day),
  ],
);

// Every recommendation call made for a trip, for the "How we got this" panel.
export const tripCalls = pgTable(
  "trip_calls",
  {
    ...ids,
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    count: integer("count").notNull().default(0),
    ms: integer("ms").notNull().default(0),
    loosened: jsonb("loosened").$type<string[]>().notNull().default([]),
    // seed | ask:<id> | profile | manual
    source: text("source").notNull().default("manual"),
    // Agent calls are keyed by (tool call, step, index): a retried step
    // rewrites its rows instead of adding new ones. Null for other callers.
    toolCallId: text("tool_call_id"),
    step: text("step"),
    idx: integer("idx"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("trip_calls_trip_idx").on(t.tripId, t.createdAt),
    uniqueIndex("trip_calls_tool_call_step_idx").on(t.toolCallId, t.step, t.idx),
  ],
);
