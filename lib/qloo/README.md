# lib/qloo: recommendation client

Server only (`import "server-only"`). Ground truth for every endpoint and quirk: `QLOO_API_FINDINGS.md`.

| File | What it holds |
|---|---|
| `contracts.ts` | Types of the public surface. `api.ts` annotates its exports with them; a compile-time check asserts `NormalizedPlace` is a valid `places` insert. |
| `client.ts` | `qlooGet` / `createQlooClient`: allowlist, cache, retry, call records. |
| `params.ts` | Allowlists per endpoint, serialization, TTLs, `point()`. |
| `cache.ts` | `cacheKey`, the `api_cache` store and an in-memory store for tests and scripts. |
| `types.ts` | Zod 4 schemas for every response (loose objects, required fields we rely on). |
| `normalize.ts` | Pure: `normalizePlace`, `categoryOf`, `displayScore`, `explainabilityFor`, `sharedTagsFor`, locality helpers. Safe to import from UI code. |
| `api.ts` | `resolveLocality`, `searchEntities`, `findPlaces`, `scoreEntities`, `tastePortrait`, `findTags`, `getEntities`, `destinationsFor`. |

Every API function returns its data plus `calls: QlooCall[]` (`{ endpoint, params, count, ms, cached, tripId? }`, id lists cut to 10). The caller persists rows (`upsertPlaces`) and calls (`logTripCall`); this module writes only `api_cache`.

## Endpoints used

| Function | Request |
|---|---|
| `resolveLocality` | `/search?types=urn:entity:locality&take=5` |
| `searchEntities` | `/search?query&types&take[&filter.location=lat,lon]` |
| `findPlaces` | `/v2/insights?filter.type=urn:entity:place&filter.location=POINT(lon lat)&filter.location.radius&signal.interests.entities&feature.explainability=true[&filter.tags&operator.filter.tags&filter.price_level.max&filter.exclude.entities&page]` |
| `scoreEntities` | `/v2/insights` + `filter.results.entities` (chunks of 50) |
| `tastePortrait` | `/v2/insights?filter.type=urn:tag&filter.tag.types=ambience,cuisine,decor&take=20` |
| `findTags` | `/v2/tags?filter.query&filter.parents.types=urn:entity:place&take=10` |
| `getEntities` | `/entities?entity_ids=` (sequential chunks of 25) |
| `destinationsFor` | `/v2/insights?filter.type=urn:entity:destination[&filter.geocode.country_code]` |

## Params allowlist

The upstream answers HTTP 200 with a generic, signal-free list when it does not know a param, so `serializeParams` throws `QlooParamError` on any key that is not listed, and on values of the wrong shape (take 1 to 50, POINT format, lists without commas). Arrays are comma-joined, keys sorted.

- `/search`: `query`, `types`, `take`, `page`, `filter.location` (lat,lon)
- `/v2/insights`: `filter.type`, `filter.location` (POINT only), `filter.location.radius`, `filter.tags`, `operator.filter.tags`, `filter.price_level.min/max`, `filter.exclude.entities`, `filter.results.entities`, `filter.tag.types`, `filter.geocode.country_code`, `signal.interests.entities`, `signal.interests.tags`, `feature.explainability`, `bias.trends`, `take`, `page`
- `/v2/tags`: `filter.query`, `filter.parents.types`, `take`, `page`
- `/entities`: `entity_ids`

Not listed on purpose: `filter.location.query` (wrong city for ambiguous names), `filter.exclude.tags` (tested, silently ignored). Add a param only after testing it live.

## Cache and retries

Key: `qloo:` + sha256 of the endpoint and its sorted serialized params. TTLs: insights 24 h, search 7 d, tags 7 d, entities 30 d. `akas` (names in 60 languages) are stripped before caching. A cached body that fails the current schema is refetched. Cache read or write failures log and fall through. One retry after 400 ms on 5xx or a dropped connection; never on 4xx or a timeout (20 s). At most 2 requests in flight per process; bulk callers (the seed) still go sequentially.

## The geocoder fix

`filter.location.query=Copenhagen` returns Copenhagen, New York. So the destination picker uses `resolveLocality` (candidates with disambiguation, lat/lon, country code from the ancestors, and a radius from the boundary's bounding box, 2 to 25 km), and `findPlaces` always sends `POINT(lon lat)` plus radius. With a POINT the API returns no `query.localities`, so `localityCheck` reads the results: `ok` is false when fewer than half are in the destination's country or fewer than 80% are within 1.25x the radius. When none is in the country, `findPlaces` throws `QlooLocalityMismatchError`.

## Fallbacks

Fewer than 5 results (or `take` if smaller): drop `filter.tags`, then the price cap. `loosened` lists what was dropped (`"tags"`, `"price"`). Results from stricter steps stay in the set; the set is re-ranked by affinity and capped at `take`. Note: the price filter drops places without a `price_level` (museums, hotels), so do not pass `priceMax` for see or stay.

## The category re-check

Category filters are loose (restaurants come back under `cocktail_bar`, a beer restaurant under `museum`). `categoryOf` reads `properties.primary_genre` first: the leaf decides (`restaurant:cocktail_bar` is drink, `restaurant:cafe` coffee, `art_museum` see, `hotel` stay), and a plain `restaurant` genre is eat whatever its tags say. Only without a genre do the `urn:tag:category:place:*` tags decide, restaurants first. `CATEGORY_FILTER_TAGS` holds the union filters per board group.

## Scores and explainability

Affinities bunch (0.79 to 0.80 for a top 10), so `displayScore` is rank-based within the result set: best 94, worst 60, even steps, ties share a score; an affinity below the whole set (a weak "Your place") keeps stepping down below 60. Explainability per result looks like:

```json
"query": { "affinity": 0.7999, "distance": 7230,
  "explainability": { "signal.interests.entities": [
    { "entity_id": "3F659C60-...", "score": 0.2816 },
    { "entity_id": "55E6BA87-...", "score": 0.2584 } ] } }
```

`explainabilityFor(result, favorites)` turns that into `[{ entityId, name, share }]`, integer shares summing to 100 (largest remainder), biggest first. Tag-only signals return no explainability, so the card shows no drivers.

## Normalized place

`normalizePlace` maps one result from any endpoint to the `places` insert. Google ids: `properties.external.google_place` (object) in `/search` and `/entities`, top-level `external.google_place` (array) in `/v2/insights`. `googleCid` is the decimal CID (`cidFromHex(google_place.id)`). `rating` is `business_rating` as text for `numeric(3,2)`; `ratingCount` stays null (no count comes with it). `properties` keeps the profile block: hours, phone, website, keywords, the long descriptions, specialty dishes, external ratings.

## Checks

- `npm test`: fixtures in `__fixtures__/` were recorded live on 2026-10-21 (one result each, `akas` removed).
- `npx tsx --conditions=react-server scripts/qloo-smoke.ts`: live smoke against `.env.local`.
