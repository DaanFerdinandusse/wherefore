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
  countryCodeOfPlace,
  displayScore,
  explainabilityFor,
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
 * text geocoder picks the wrong city for ambiguous names). With fewer than 5
 * results it drops filter.tags, then the price cap, and says so in `loosened`;
 * stricter results stay in the set ahead of the extra ones.
 * @throws QlooLocalityMismatchError when none of the results is in the
 *   destination's country.
 */
export const findPlaces: FindPlaces = async (input, ctx) => {
  const client = clientOf(ctx);
  const { destination, signals } = input;
  const hasSignals = signals.length > 0;
  const hasTags = (input.tags?.length ?? 0) > 0;
  const hasPrice = input.priceMax !== undefined;

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
  const tagParams: QlooParams = hasTags
    ? { "filter.tags": input.tags, "operator.filter.tags": input.tagsOperator }
    : {};
  const priceParams: QlooParams = hasPrice ? { "filter.price_level.max": input.priceMax } : {};

  // Strict first, then each loosening step in order. Each step keeps the
  // previous ones dropped.
  const steps: { drop: LoosenedFilter | null; params: QlooParams }[] = [
    { drop: null, params: { ...base, ...tagParams, ...priceParams } },
  ];
  if (hasTags) steps.push({ drop: "tags", params: { ...base, ...priceParams } });
  if (hasPrice) steps.push({ drop: "price", params: { ...base } });

  const enough = Math.min(MIN_RESULTS, input.take);
  const calls: QlooCall[] = [];
  const loosened: LoosenedFilter[] = [];
  const collected = new Map<string, InsightsPlacesResponse["results"]["entities"][number]>();
  let localityLabel: string | undefined;

  for (const step of steps) {
    if (step.drop) loosened.push(step.drop);
    const { data, call } = await client.get("/v2/insights", step.params, {
      schema: insightsPlacesResponseSchema,
      tripId: ctx?.tripId,
    });
    calls.push(call);
    localityLabel ??= data.query?.localities?.filter?.[0]?.disambiguation ?? undefined;
    for (const raw of data.results.entities) if (!collected.has(raw.entity_id)) collected.set(raw.entity_id, raw);
    if (collected.size >= enough) break;
  }

  const raws = [...collected.values()].sort((a, b) => b.query.affinity - a.query.affinity).slice(0, input.take);
  const affinities = raws.map((r) => r.query.affinity);
  const results: PlaceResult[] = raws.map((raw) => {
    const place = normalizePlace(raw);
    return {
      place,
      category: categoryOf(place),
      affinity: raw.query.affinity,
      score: displayScore(raw.query.affinity, affinities),
      signalScores: signalScoresOf(raw),
      distanceM: raw.query.distance ?? null,
    };
  });

  const localityCheck = checkLocality(destination, results, localityLabel);
  if (!localityCheck.ok && destination.countryCode && results.length > 0) {
    const inCountry = results.some((r) => countryCodeOfPlace(r) === destination.countryCode?.toUpperCase());
    if (!inCountry) throw new QlooLocalityMismatchError(localityCheck.requested, localityCheck.resolved);
  }
  return { results, loosened, localityCheck, calls };
};

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
