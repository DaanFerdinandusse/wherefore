import "server-only";

// The recommendation functions the agent tools call (docs/PLAN.md 4.1). Each
// returns normalized data plus the `calls` it made; persisting rows and call
// logs is the caller's job (`upsertPlaces`, `logTripCall`). Bulk work here is
// sequential on purpose: parallel requests run into upstream rate limits.

import type { TasteTag } from "@/lib/contracts";

import { getQlooClient } from "./client";
import type {
  CallContext,
  DestinationsFor,
  EntityCandidate,
  FindPlaces,
  FindTags,
  GetEntities,
  LoosenedFilter,
  NormalizedPlace,
  PlaceResult,
  QlooCall,
  ResolveLocality,
  ScoreEntities,
  ScoredEntity,
  SearchEntities,
  TastePortrait,
} from "./contracts";
import { QlooLocalityMismatchError } from "./errors";
import {
  categoryOf,
  checkLocality,
  displayScore,
  distanceFromDestination,
  explainabilityFor,
  isTooFar,
  isUnpricedTagFilter,
  majorityLocalityLabel,
  normalizeLocality,
  normalizePlace,
  signalScoresOf,
} from "./normalize";
import { type QlooParams, latLon, point } from "./params";
import {
  type InsightsPlacesResponse,
  entitiesResponseSchema,
  insightsDestinationsResponseSchema,
  insightsPlacesResponseSchema,
  insightsTagsResponseSchema,
  localitySearchResponseSchema,
  searchResponseSchema,
  tagsSearchResponseSchema,
} from "./types";

const PLACE = "urn:entity:place";
/** Fewer results than this and findPlaces loosens its filters. */
export const MIN_RESULTS = 5;
const PORTRAIT_TAG_TYPES = ["urn:tag:ambience:qloo", "urn:tag:cuisine:qloo", "urn:tag:decor:qloo"];
const ENTITY_CHUNK = 25;
const SCORE_CHUNK = 50;

type RawInsightsPlace = InsightsPlacesResponse["results"]["entities"][number];

function clientOf(ctx: CallContext | undefined) {
  return ctx?.client ?? getQlooClient();
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function clampRadius(radiusM: number): number {
  return Math.min(100_000, Math.max(100, Math.round(radiusM)));
}

// ------------------------------------------------------------------ localities

/** Destination picker: locality candidates with lat/lon and disambiguation.
 *  Trips store the POINT and radius from here, never free text. */
export const resolveLocality: ResolveLocality = async (name, ctx) => {
  const { data, call } = await clientOf(ctx).get(
    "/search",
    { query: name, types: ["urn:entity:locality"], take: 5 },
    { schema: localitySearchResponseSchema, tripId: ctx?.tripId },
  );
  return { candidates: data.results.map(normalizeLocality), calls: [call] };
};

// -------------------------------------------------------------------- search

/** Favorites picker. Search is fuzzy, so bias it to the client's home city with
 *  `near` and show the address so the advisor can confirm the match. */
export const searchEntities: SearchEntities = async (query, options, ctx) => {
  const { data, call } = await clientOf(ctx).get(
    "/search",
    {
      query,
      types: typeof options.types === "string" ? [options.types] : options.types,
      take: options.take ?? 5,
      "filter.location": options.near ? latLon(options.near.lat, options.near.lon) : undefined,
    },
    { schema: searchResponseSchema, tripId: ctx?.tripId },
  );
  const candidates = data.results.map((raw): EntityCandidate => {
    const isPlace = (raw.types ?? []).includes(PLACE) || raw.subtype === PLACE;
    const place = normalizePlace(raw);
    const imageUrl = place.images[0]?.url;
    return {
      entityId: raw.entity_id,
      name: place.name,
      ...(place.address ? { address: place.address } : {}),
      ...(raw.disambiguation ? { disambiguation: raw.disambiguation } : {}),
      ...(place.lat !== null && place.lon !== null ? { lat: place.lat, lon: place.lon } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(place.googlePlaceId ? { googlePlaceId: place.googlePlaceId } : {}),
      ...(place.googleCid ? { googleCid: place.googleCid } : {}),
      tags: place.tags,
      ...(isPlace ? { place } : {}),
    };
  });
  return { candidates, calls: [call] };
};

// ---------------------------------------------------------------- findPlaces

/**
 * Recommendations near the destination for the client's signals, with
 * per-result explainability. Location is always POINT(lon lat) plus radius (the
 * text geocoder picks the wrong city for ambiguous names), and every result
 * farther than 1.5x the radius is dropped (distance from the API, or computed
 * from the coordinates). With fewer than 5 kept results it drops one filter at
 * a time, in this order: tags, popularity, Michelin, price, the open day. The
 * open day goes last because a closed restaurant is the worst outcome. Every
 * drop is named in `loosened`. Strict results always come first; looser steps
 * only fill the slots that are left.
 * @throws QlooLocalityMismatchError when results came back but none of them is
 *   near the destination.
 */
export const findPlaces: FindPlaces = async (input, ctx) => {
  const client = clientOf(ctx);
  const { destination, signals } = input;
  const hasSignals = signals.length > 0;
  const hasTags = (input.tags?.length ?? 0) > 0;
  // Places without a price level (museums, hotels) never pass a price filter,
  // so a cap on a see or stay ask is not applied at all, and the result says so.
  const priceNotApplicable = input.priceMax !== undefined && hasTags && isUnpricedTagFilter(input.tags ?? []);
  const hasPrice = input.priceMax !== undefined && !priceNotApplicable;

  const base: QlooParams = {
    "filter.type": PLACE,
    "filter.location": point(destination.lat, destination.lon),
    "filter.location.radius": clampRadius(destination.radiusM),
    "signal.interests.entities": hasSignals ? signals : undefined,
    "feature.explainability": hasSignals ? true : undefined,
    "filter.exclude.entities": input.excludeIds?.length ? input.excludeIds : undefined,
    take: input.take,
    page: input.page,
  };

  // In the order they are dropped.
  const filters: { drop: LoosenedFilter; params: QlooParams }[] = [];
  if (hasTags) {
    filters.push({ drop: "tags", params: { "filter.tags": input.tags, "operator.filter.tags": input.tagsOperator } });
  }
  if (input.popularityMax !== undefined) {
    filters.push({ drop: "popularity", params: { "filter.popularity.max": input.popularityMax } });
  }
  if (input.michelin) filters.push({ drop: "michelin", params: { "filter.external.exists": "michelin" } });
  if (hasPrice) filters.push({ drop: "price", params: { "filter.price_level.max": input.priceMax } });
  if (input.openDay) filters.push({ drop: "hours", params: { "filter.hours": input.openDay } });

  // Strict first, then each loosening step in order. Each step keeps the
  // previous ones dropped.
  const paramsFrom = (first: number): QlooParams =>
    filters.slice(first).reduce<QlooParams>((params, filter) => ({ ...params, ...filter.params }), base);
  const steps: { drop: LoosenedFilter | null; params: QlooParams }[] = [
    { drop: null, params: paramsFrom(0) },
    ...filters.map((filter, index) => ({ drop: filter.drop, params: paramsFrom(index + 1) })),
  ];

  const enough = Math.min(MIN_RESULTS, input.take);
  const calls: QlooCall[] = [];
  const loosened: LoosenedFilter[] = priceNotApplicable ? ["price_not_applicable"] : [];
  // One list per step, in step order, so a looser result never outranks a
  // stricter one. Entity ids are unique across all of them.
  const stages: Candidate[][] = [];
  const seen = new Set<string>();
  const far: PlaceResult[] = [];
  let kept = 0;
  let localityLabel: string | undefined;

  for (const step of steps) {
    if (step.drop) loosened.push(step.drop);
    const { data, call } = await client.get("/v2/insights", step.params, {
      schema: insightsPlacesResponseSchema,
      tripId: ctx?.tripId,
    });
    calls.push(call);
    localityLabel ??= data.query?.localities?.filter?.[0]?.disambiguation ?? undefined;
    const stage: Candidate[] = [];
    for (const raw of data.results.entities) {
      if (seen.has(raw.entity_id)) continue;
      seen.add(raw.entity_id);
      const place = normalizePlace(raw);
      const distanceM = distanceFromDestination(destination, place, raw.query.distance);
      if (isTooFar(destination, distanceM)) far.push(toResult({ raw, place, distanceM }, []));
      else stage.push({ raw, place, distanceM });
    }
    stage.sort((a, b) => b.raw.query.affinity - a.raw.query.affinity);
    stages.push(stage);
    kept += stage.length;
    if (kept >= enough) break;
  }

  if (kept === 0 && far.length > 0) {
    const requested = destination.disambiguation ?? destination.name;
    throw new QlooLocalityMismatchError(requested, localityLabel ?? majorityLocalityLabel(far) ?? "unknown");
  }

  const picked = stages.flat().slice(0, input.take);
  const affinities = picked.map((c) => c.raw.query.affinity);
  const results = picked.map((c) => toResult(c, affinities));
  const localityCheck = checkLocality(destination, results, localityLabel, far.length);
  return { results, loosened, localityCheck, calls };
};

type Candidate = { raw: RawInsightsPlace; place: NormalizedPlace; distanceM: number | null };

function toResult({ raw, place, distanceM }: Candidate, affinities: readonly number[]): PlaceResult {
  return {
    place,
    category: categoryOf(place),
    affinity: raw.query.affinity,
    score: displayScore(raw.query.affinity, affinities),
    signalScores: signalScoresOf(raw),
    distanceM,
  };
}

// ------------------------------------------------------------------- scoring

/** Scores a shortlist (the advisor's places, a named list) for the client's
 *  signals, with per-input explainability. Sorted by affinity. */
export const scoreEntities: ScoreEntities = async (input, ctx) => {
  if (input.entityIds.length === 0 || input.signals.length === 0) return { scores: [], calls: [] };
  const client = clientOf(ctx);
  const calls: QlooCall[] = [];
  const scores: ScoredEntity[] = [];
  for (const ids of chunk([...new Set(input.entityIds)], SCORE_CHUNK)) {
    const { data, call } = await client.get(
      "/v2/insights",
      {
        "filter.type": PLACE,
        "filter.results.entities": ids,
        "signal.interests.entities": input.signals,
        "feature.explainability": true,
        "filter.location": input.destination ? point(input.destination.lat, input.destination.lon) : undefined,
        "filter.location.radius": input.destination ? clampRadius(input.destination.radiusM) : undefined,
        take: ids.length,
      },
      { schema: insightsPlacesResponseSchema, tripId: ctx?.tripId },
    );
    calls.push(call);
    for (const raw of data.results.entities) {
      const signalScores = signalScoresOf(raw);
      scores.push({
        entityId: raw.entity_id,
        name: raw.name,
        affinity: raw.query.affinity,
        signalScores,
        explainability: input.favorites ? explainabilityFor({ signalScores }, input.favorites) : [],
        place: normalizePlace(raw),
      });
    }
  }
  scores.sort((a, b) => b.affinity - a.affinity);
  return { scores, calls };
};

// -------------------------------------------------------------- taste portrait

/** The client's taste portrait: ambience, cuisine and decor tags (other tag
 *  families are noisy: music genres, dishes). Same-name tags across families
 *  are merged, keeping the higher affinity. */
export const tastePortrait: TastePortrait = async (signals, ctx) => {
  if (signals.length === 0) return { tags: [], calls: [] };
  const { data, call } = await clientOf(ctx).get(
    "/v2/insights",
    {
      "filter.type": "urn:tag",
      "signal.interests.entities": signals,
      "filter.tag.types": PORTRAIT_TAG_TYPES,
      take: 20,
    },
    { schema: insightsTagsResponseSchema, tripId: ctx?.tripId },
  );
  const seen = new Set<string>();
  const tags: TasteTag[] = [];
  for (const tag of data.results.tags) {
    const key = tag.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const score = tag.query?.affinity;
    tags.push({
      tagId: tag.tag_id,
      name: tag.name,
      ...(tag.subtype ? { type: tag.subtype } : {}),
      ...(typeof score === "number" ? { score } : {}),
    });
  }
  return { tags, calls: [call] };
};

// ----------------------------------------------------------------------- tags

/** Maps free text ("natural wine") to place tag ids. */
export const findTags: FindTags = async (text, ctx) => {
  const { data, call } = await clientOf(ctx).get(
    "/v2/tags",
    { "filter.query": text, "filter.parents.types": [PLACE], take: 10 },
    { schema: tagsSearchResponseSchema, tripId: ctx?.tripId },
  );
  const tags = data.results.tags.map((t) => ({ tagId: t.id, name: t.name, ...(t.type ? { type: t.type } : {}) }));
  return { tags, calls: [call] };
};

// ------------------------------------------------------------------- entities

/** Full rows by id, for re-hydration and the 30-day refresh. Sequential chunks. */
export const getEntities: GetEntities = async (ids, ctx) => {
  const client = clientOf(ctx);
  const calls: QlooCall[] = [];
  const places = [];
  for (const part of chunk([...new Set(ids)], ENTITY_CHUNK)) {
    const { data, call } = await client.get(
      "/entities",
      { entity_ids: part },
      { schema: entitiesResponseSchema, tripId: ctx?.tripId },
    );
    calls.push(call);
    places.push(...data.results.map(normalizePlace));
  }
  return { places, calls };
};

// --------------------------------------------------------------- destinations

/** Where this client should go, optionally within one country. Low priority. */
export const destinationsFor: DestinationsFor = async (signals, countryCode, ctx) => {
  if (signals.length === 0) return { destinations: [], calls: [] };
  const { data, call } = await clientOf(ctx).get(
    "/v2/insights",
    {
      "filter.type": "urn:entity:destination",
      "signal.interests.entities": signals,
      "filter.geocode.country_code": countryCode?.toUpperCase(),
      take: 10,
    },
    { schema: insightsDestinationsResponseSchema, tripId: ctx?.tripId },
  );
  const destinations = data.results.entities.map((d) => {
    const code = d.properties?.geocode?.country_code ?? undefined;
    return {
      entityId: d.entity_id,
      name: d.name,
      ...(d.location ? { lat: d.location.lat, lon: d.location.lon } : {}),
      ...(code ? { countryCode: code } : {}),
      affinity: d.query.affinity,
    };
  });
  return { destinations, calls: [call] };
};
