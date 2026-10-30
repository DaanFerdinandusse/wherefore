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
| `findPlaces` | `/v2/insights?filter.type=urn:entity:place&filter.location=POINT(lon lat)&filter.location.radius&signal.interests.entities&feature.explainability=true[&filter.tags&operator.filter.tags&filter.popularity.max&filter.external.exists&filter.price_level.max&filter.hours&filter.exclude.entities&page]` |
| `scoreEntities` | `/v2/insights` + `filter.results.entities` (chunks of 50) |
| `tastePortrait` | `/v2/insights?filter.type=urn:tag&filter.tag.types=ambience,cuisine,decor&take=20` |
| `findTags` | `/v2/tags?filter.query&filter.parents.types=urn:entity:place&take=10` |
| `getEntities` | `/entities?entity_ids=` (sequential chunks of 25) |
| `destinationsFor` | `/v2/insights?filter.type=urn:entity:destination[&filter.geocode.country_code]` |

## Params allowlist

The upstream answers HTTP 200 with a generic, signal-free list when it does not know a param, so `serializeParams` throws `QlooParamError` on any key that is not listed, and on values of the wrong shape (take 1 to 50, POINT format, lists without commas). Arrays are comma-joined, keys sorted.

- `/search`: `query`, `types`, `take`, `page`, `filter.location` (lat,lon)
- `/v2/insights`: `filter.type`, `filter.location` (POINT only), `filter.location.radius`, `filter.tags`, `operator.filter.tags`, `filter.price_level.min/max`, `filter.popularity.max` (0 to 1), `filter.external.exists` (michelin only), `filter.hours` (lower case weekday), `filter.exclude.entities`, `filter.results.entities`, `filter.tag.types`, `filter.geocode.country_code`, `signal.interests.entities`, `signal.interests.tags`, `feature.explainability`, `bias.trends`, `take`, `page`
- `/v2/tags`: `filter.query`, `filter.parents.types`, `take`, `page`
- `/entities`: `entity_ids`

Not listed on purpose: `filter.location.query` (wrong city for ambiguous names), `filter.exclude.tags` (tested, silently ignored). Add a param only after testing it live.

## Cache and retries

Key: `qloo:` + sha256 of `JSON.stringify([endpoint, pairs])`, pairs sorted by key (JSON escapes every value, so `a&take=3` cannot collide with two params). TTLs: insights 24 h, search 7 d, tags 7 d, entities 30 d; an answer with zero results is kept 60 s at most on any endpoint (a cold upstream or a rate limit can return an empty page). `akas` (names in 60 languages) are stripped before caching. A cached body that fails the current schema is refetched. Cache read or write failures log and fall through. Concurrent identical requests in one instance share one cache read and one fetch; the joiners' call records say `cached: true` (other instances still meet at the table). One retry after 400 ms on 5xx or a dropped connection; never on 4xx or a timeout (20 s). At most 2 requests in flight per process; bulk callers (the seed) still go sequentially.

## The geocoder fix

`filter.location.query=Copenhagen` returns Copenhagen, New York. So the destination picker uses `resolveLocality` (candidates with disambiguation, lat/lon, country code from the ancestors, and a radius from the boundary's bounding box, 2 to 25 km), and `findPlaces` always sends `POINT(lon lat)` plus radius. With a POINT the API returns no `query.localities`, so `findPlaces` checks every result itself: the distance is `query.distance`, or the haversine distance from the destination point when the API gives none, and a result farther than 1.5x the radius is dropped (another city in the same country no longer passes). `localityCheck.dropped` says how many. `ok` is false when fewer than half of the kept results are in the destination's country or fewer than 80% are within 1.25x the radius (a result with neither distance nor coordinates does not count as near). Results came back but none survived: `findPlaces` throws `QlooLocalityMismatchError`. `PlaceResult.distanceM` carries the computed distance too.

## Fallbacks

Fewer than 5 kept results (or `take` if smaller): drop `filter.tags`, then the popularity cap, then Michelin, then the price cap, and last the open day, because a closed restaurant is the worst outcome. An ask for a bare category (`isCategoryTagFilter`) keeps it longer: popularity, Michelin, price, the category, the open day. A place whose own hours say closed on the open day never comes back on any step (`closedOn`); unknown hours stay. Strict results always come first, sorted by affinity; each looser step only fills the slots that are left, so a loosened result never displaces a strict one even with a higher affinity. Scores stay affinity-based over the final set.

`loosened` lists what was not applied as asked, for the whole search; each result carries its own `loosened` when it needed a drop, so one place can be told apart from the list:

| Value | Meaning | UI copy |
|---|---|---|
| `"tags"` | too few results, `filter.tags` dropped | "Widened beyond the category" |
| `"popularity"` | too few less known places, `filter.popularity.max` dropped | "Too few less known places, so check which of these carry the Less known chip." |
| `"michelin"` | too few Michelin places, `filter.external.exists` dropped | "Too few Michelin places, so check which of these carry the Michelin chip." |
| `"price"` | too few results, price cap dropped | "Price cap dropped to find enough places" |
| `"hours"` | too few places listed as open that day (closed, or no hours block), `filter.hours` dropped. A place whose own hours say closed that day, or for the asked slot, stays out regardless. Those hours come from `/entities`: `/v2/insights` lists only the first span of a day | "Too few places are listed as open on Monday, so check the hours on these." |
| `"price_not_applicable"` | `priceMax` asked on a see or stay ask; never sent | "Price cap not applied to museums and hotels" |

The price filter drops places without a `price_level` (museums, hotels), so when every tag is a see or stay category (`isUnpricedTagFilter`), `findPlaces` does not send `priceMax` and returns `"price_not_applicable"` first in `loosened`, whether or not the tags were dropped later.

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

`explainabilityFor(result, favorites)` turns that into `[{ entityId, name, share }]`, integer shares summing to 100 (largest remainder), biggest first. Signals without a name in `favorites` are never rescaled away: together they are one `{ entityId: "other" (OTHER_FAVORITES_ID), name: "Other favorites", share }` entry, listed last. No named driver at all, or tag-only signals (no explainability): an empty array, so the card shows no drivers.

## Normalized place

`normalizePlace` maps one result from any endpoint to the `places` insert. Google ids: `properties.external.google_place` (object) in `/search` and `/entities`, top-level `external.google_place` (array) in `/v2/insights`. `googleCid` is the decimal CID (`cidFromHex(google_place.id)`). `rating` is `business_rating` as text for `numeric(3,2)`; `ratingCount` stays null (no count comes with it). `properties` keeps the profile block: hours, phone, website, keywords, the long descriptions, specialty dishes, external ratings.

## Checks

- `npm test`: fixtures in `__fixtures__/` were recorded live on 2026-10-21 (one result each, `akas` removed).
- `npx tsx --conditions=react-server scripts/qloo-smoke.ts`: live smoke against `.env.local`.
