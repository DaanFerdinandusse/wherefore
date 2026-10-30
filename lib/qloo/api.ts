import "server-only";

// The recommendation functions the agent tools call (docs/PLAN.md 4.1). Each
// returns normalized data plus the `calls` it made; persisting rows and call
// logs is the caller's job (`upsertPlaces`, `logTripCall`). Bulk work here is
// sequential on purpose: parallel requests run into upstream rate limits.

import type { z } from "zod";

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
  WiderCircle,
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
  closedOn,
  displayScore,
  distanceFromDestination,
  explainabilityFor,
  hasHoursOn,
  isCategoryTagFilter,
  isTooFar,
  isUnpricedTagFilter,
  majorityLocalityLabel,
  normalizeLocality,
  normalizePlace,
  openDuring,
  signalScoresOf,
  isShoppingPlace,
} from "./normalize";
import { type QlooParams, latLon, point } from "./params";
import {
  type UnsignedPlacesResponse,
  entitiesResponseSchema,
  insightsDestinationsResponseSchema,
  insightsPlacesResponseSchema,
  unsignedPlacesResponseSchema,
  insightsTagsResponseSchema,
  localitySearchResponseSchema,
  searchResponseSchema,
  tagsSearchResponseSchema,
} from "./types";

const PLACE = "urn:entity:place";
/** Fewer results than this and findPlaces loosens its filters. */
export const MIN_RESULTS = 5;
/** A search for an open day asks for this many times its take: the check on each place's own hours comes after it. */
const OPEN_DAY_OVERFETCH = 3;
const MAX_UPSTREAM_TAKE = 50;
const PORTRAIT_TAG_TYPES = ["urn:tag:ambience:qloo", "urn:tag:cuisine:qloo", "urn:tag:decor:qloo"];
const ENTITY_CHUNK = 25;
const SCORE_CHUNK = 50;

type RawInsightsPlace = UnsignedPlacesResponse["results"]["entities"][number];

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

const SHOPPING_SPARES = 5;

/**
 * Recommendations near the destination for the client's signals, with
 * per-result explainability. Location is always POINT(lon lat) plus radius (the
 * text geocoder picks the wrong city for ambiguous names), and every result
 * farther than 1.5x the radius is dropped (distance from the API, or computed
 * from the coordinates). With fewer than 5 kept results it first tries the
 * wider circles of `widen`, then drops one filter at a time, in this order:
 * tags, popularity, Michelin, price. An ask for a bare category keeps it longer:
 * popularity, Michelin, price, the category, because a bar for a dinner ask is
 * worse than a restaurant that misses one option.
 *
 * Open and closed come from /entities, read for every place of every step,
 * because /v2/insights is not reliable on either: it lists the first span of a
 * day, calls some open places closed all week (filter.hours drops them with no
 * trace), and reports no place as closed for good. So filter.hours is not sent.
 * A closed-for-good place never comes back, and on an open day neither does one
 * whose hours say closed that day or for that slot. A place with no hours on
 * record comes last, after every other filter has gone, as loosened "hours".
 *
 * Every drop is named in `loosened`, the whole search's and each result's own.
 * Strict results always come first, and closer ones before farther ones; looser
 * steps only fill the slots that are left.
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
  const schema: z.ZodType<UnsignedPlacesResponse> = hasSignals ? insightsPlacesResponseSchema : unsignedPlacesResponseSchema;
  const slot = input.openDay ? input.openSlot : undefined;

  const base: QlooParams = {
    "filter.type": PLACE,
    "filter.location": point(destination.lat, destination.lon),
    "signal.interests.entities": hasSignals ? signals : undefined,
    "feature.explainability": hasSignals ? true : undefined,
    "filter.exclude.entities": input.excludeIds?.length ? input.excludeIds : undefined,
    // Spares: dropped malls and the check on each place's own hours must not
    // leave the list short.
    take: Math.min(
      MAX_UPSTREAM_TAKE,
      (input.openDay ? input.take * OPEN_DAY_OVERFETCH : input.take) + (input.noShopping ? SHOPPING_SPARES : 0),
    ),
    page: input.page,
  };

  // In the order they are dropped.
  const filters: { drop: LoosenedFilter; params: QlooParams }[] = [];
  const tagFilter = { drop: "tags" as const, params: { "filter.tags": input.tags, "operator.filter.tags": input.tagsOperator } };
  const bareCategory = hasTags && isCategoryTagFilter(input.tags ?? []);
  if (hasTags && !bareCategory) filters.push(tagFilter);
  if (input.popularityMax !== undefined) {
    filters.push({ drop: "popularity", params: { "filter.popularity.max": input.popularityMax } });
  }
  if (input.michelin) filters.push({ drop: "michelin", params: { "filter.external.exists": "michelin" } });
  if (hasPrice) filters.push({ drop: "price", params: { "filter.price_level.max": input.priceMax } });
  if (bareCategory) filters.push(tagFilter);

  // Strict first, in each circle from small to wide, then each loosening step
  // in order, in the widest circle that is not a last resort. Each step keeps
  // the previous ones dropped.
  const inCircle = (radiusM: number): QlooParams => ({ ...base, "filter.location.radius": clampRadius(radiusM) });
  const filtersFrom = (first: number): QlooParams =>
    filters.slice(first).reduce<QlooParams>((params, filter) => ({ ...params, ...filter.params }), {});
  const circles: WiderCircle[] = [{ radiusM: destination.radiusM }, ...(input.widen ?? [])];
  const steps: (WiderCircle & { drop: LoosenedFilter | null; params: QlooParams })[] = circles.map((circle) => ({
    ...circle,
    drop: null,
    params: { ...inCircle(circle.radiusM), ...filtersFrom(0) },
  }));
  const looseM = circles.filter((c) => c.below === undefined).at(-1)?.radiusM ?? destination.radiusM;
  filters.forEach((filter, index) => {
    steps.push({ drop: filter.drop, radiusM: looseM, params: { ...inCircle(looseM), ...filtersFrom(index + 1) } });
  });

  const enough = Math.min(MIN_RESULTS, input.take);
  const calls: QlooCall[] = [];
  const loosened: LoosenedFilter[] = priceNotApplicable ? ["price_not_applicable"] : [];
  // One list per step, in step order, so a looser result never outranks a
  // stricter one. Entity ids are unique across all of them.
  const stages: Candidate[][] = [];
  const seen = new Set<string>();
  // By entity id: a place too far for a small circle can be kept by a wider one.
  const far = new Map<string, PlaceResult>();
  // No hours on record for the open day: the last resort, after every filter.
  const noHours: Candidate[] = [];
  let kept = 0;
  let reachedM = destination.radiusM;
  let localityLabel: string | undefined;

  for (const step of steps) {
    if (step.below !== undefined && kept >= step.below) continue;
    if (step.drop) loosened.push(step.drop);
    reachedM = Math.max(reachedM, step.radiusM);
    const dropped = [...loosened];
    const { data, call } = await client.get("/v2/insights", step.params, {
      schema,
      tripId: ctx?.tripId,
    });
    calls.push(call);
    localityLabel ??= data.query?.localities?.filter?.[0]?.disambiguation ?? undefined;
    const found: Candidate[] = [];
    for (const raw of data.results.entities) {
      if (seen.has(raw.entity_id)) continue;
      const place = normalizePlace(raw);
      if (input.noShopping && isShoppingPlace(place)) continue;
      const distanceM = distanceFromDestination(destination, place, raw.query.distance);
      if (isTooFar(step, distanceM)) {
        far.set(raw.entity_id, toResult({ raw, place, distanceM, dropped }, []));
        continue;
      }
      seen.add(raw.entity_id);
      far.delete(raw.entity_id);
      found.push({ raw, place, distanceM, dropped });
    }
    const facts = await entityFacts(found.map((c) => c.raw.entity_id), ctx);
    calls.push(...facts.calls);
    const stage: Candidate[] = [];
    for (const candidate of found.map((c) => withEntityFacts(c, facts.byEntity))) {
      const { hours, is_closed: closedForGood } = candidate.place.properties;
      if (closedForGood === true) continue;
      if (input.openDay) {
        if (closedOn(hours, input.openDay)) continue;
        // Only on /entities hours: the first span alone would take a dinner for shut.
        if (slot && candidate.fullHours && !openDuring(hours, input.openDay, slot)) continue;
        if (!hasHoursOn(hours, input.openDay)) {
          noHours.push({ ...candidate, dropped: [...candidate.dropped, "hours"] });
          continue;
        }
      }
      stage.push(candidate);
    }
    // Stable: without signals every place ties and the API's own order stays.
    stage.sort((a, b) => (b.raw.query.affinity ?? 0) - (a.raw.query.affinity ?? 0));
    stages.push(stage);
    kept += stage.length;
    if (kept >= enough) break;
  }

  if (kept + noHours.length === 0 && far.size > 0) {
    const requested = destination.disambiguation ?? destination.name;
    throw new QlooLocalityMismatchError(requested, localityLabel ?? majorityLocalityLabel([...far.values()]) ?? "unknown");
  }

  stages.push(noHours.sort((a, b) => (b.raw.query.affinity ?? 0) - (a.raw.query.affinity ?? 0)));
  const picked = stages.flat().slice(0, input.take);
  if (picked.some((c) => c.dropped.includes("hours"))) loosened.push("hours");
  const affinities = picked.flatMap((c) => c.raw.query.affinity ?? []);
  const results = picked.map((c) => toResult(c, affinities));
  const localityCheck = checkLocality({ ...destination, radiusM: reachedM }, results, localityLabel, far.size);
  return { results, loosened, localityCheck, radiusM: reachedM, calls };
};

type Candidate = {
  raw: RawInsightsPlace;
  place: NormalizedPlace;
  distanceM: number | null;
  dropped: LoosenedFilter[];
  fullHours?: true;
};

type EntityFacts = { hours?: unknown; closedForGood: boolean };

/**
 * What /entities knows about places and /v2/insights does not: every opening
 * span of a day, and that a place has closed for good (is_closed, false on every
 * /v2/insights row). Places go on the board with these. A failed lookup keeps
 * what the search returned: this is no reason to lose a search.
 */
async function entityFacts(entityIds: string[], ctx: CallContext | undefined): Promise<{ byEntity: Map<string, EntityFacts>; calls: QlooCall[] }> {
  const byEntity = new Map<string, EntityFacts>();
  if (entityIds.length === 0) return { byEntity, calls: [] };
  try {
    const { places, calls } = await getEntities(entityIds, ctx);
    for (const { entityId, properties } of places) {
      const { hours, is_closed: closed } = properties;
      const listed = typeof hours === "object" && hours !== null && Object.keys(hours).length > 0;
      byEntity.set(entityId, { closedForGood: closed === true, ...(listed ? { hours } : {}) });
    }
    return { byEntity, calls };
  } catch {
    return { byEntity, calls: [] };
  }
}

function withEntityFacts<T extends { place: NormalizedPlace; raw: { entity_id: string } }>(
  item: T,
  byEntity: ReadonlyMap<string, EntityFacts>,
): T & { fullHours?: true } {
  const facts = byEntity.get(item.raw.entity_id);
  if (!facts) return item;
  const properties = { ...item.place.properties, is_closed: facts.closedForGood, ...(facts.hours ? { hours: facts.hours } : {}) };
  return { ...item, place: { ...item.place, properties }, ...(facts.hours ? { fullHours: true as const } : {}) };
}

function toResult({ raw, place, distanceM, dropped }: Candidate, affinities: readonly number[]): PlaceResult {
  const affinity = raw.query.affinity ?? null;
  return {
    place,
    category: categoryOf(place),
    affinity,
    // No score at all rather than a number: nothing was matched to this client.
    score: affinity === null ? null : displayScore(affinity, affinities),
    signalScores: signalScoresOf(raw),
    distanceM,
    ...(dropped.length > 0 ? { loosened: dropped } : {}),
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
  const facts = await entityFacts(scores.map((s) => s.entityId), ctx);
  calls.push(...facts.calls);
  const withFacts = scores.map((s) => {
    const { place } = withEntityFacts({ place: s.place, raw: { entity_id: s.entityId } }, facts.byEntity);
    return { ...s, place };
  });
  withFacts.sort((a, b) => b.affinity - a.affinity);
  return { scores: withFacts, calls };
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
