# lib/db: the data slice

Drizzle on Neon over HTTP (`drizzle-orm/neon-http`). `lib/db/index.ts` holds the one client. The schema is split by domain in `lib/db/schema/{core,chat,cache}.ts`. Reads live in `lib/<domain>/queries.ts` and writes in `lib/<domain>/mutations.ts`. Every signature is declared once as a type in `lib/<domain>/contracts.ts`, and the implementations annotate their exports with those types. Import a domain through its barrel: `@/lib/clients`, `@/lib/places`, `@/lib/trips`.

## Tables

| Table | Owned | What it holds | Written by |
|---|---|---|---|
| `advisors` | yes | Profile per Neon Auth user: display name, home city, taste tags | `lib/auth/advisor.ts` (`ensureAdvisor` on the first authenticated request) |
| `clients`, `client_favorites` | yes (favorites through their client) | Client profile, favorites in order, rules, media, taste tags | `lib/clients` |
| `places` | no | Cache of every place touched, unique on `entity_id` | `upsertPlaces` in `lib/places` |
| `advisor_places` | yes | My places: saved place, city, private note | `lib/places` |
| `trips`, `trip_travelers` | yes (travelers through their trip) | Trip setup, stage override, share token, `built_from` | `lib/trips` |
| `trip_places`, `ask_places`, `trip_asks` | through the trip | Board cards, ask tabs and their ranked members | `lib/trips` |
| `itinerary_slots` | through the trip | Day, slot, trip place, note | `lib/trips` (`setSlots`, `upsertSlot`, `clearSlot`) |
| `trip_calls` | through the trip | The "How we got this" log | `logTripCall` in `lib/trips` |
| `chats`, `codex_credentials`, `api_cache` | see `chat.ts`, `cache.ts` | Agent runtime and provider cache | agent and recommendation slices |

`neon_auth.*` belongs to Neon Auth. We only read `neon_auth.member` to get a user's org ids (`lib/auth/server.ts`). `drizzle.config.ts` filters it out.

## Ownership rule

A row is in scope when `owner_id = <user id>` or `org_id` is one of the user's orgs. The predicate is written once, in `inScope()` (`lib/auth/scope.ts`), and every helper applies it in SQL:

- Owned tables filter on their own columns.
- Children (favorites, trip places, asks, slots, calls) filter through their parent: `trip_id in (select id from trips where <in scope>)`, or the trip is checked first with `requireTripId`.
- Every helper takes a scope: a bare owner id, `{ ownerId, orgIds }`, or the `AuthUser` that `requireUser()` returns. Rows outside the scope read as `null` or throw `NotFoundError`. "Not yours" and "not there" are the same answer.
- Ids from URLs are checked with `isUuid` first, so a malformed id is a 404, not a 500.
- `places` is shared and unowned. The public traveler view (`getSharedTripSnapshot`) is keyed by the share token alone.

Route handlers map the typed errors with `errorResponse()` from `lib/auth/errors.ts`: 401, 404, 400, 503.

## Search columns

`clients.search`, `trips.search` and `advisor_places.search` are plain text columns with trigram GIN indexes. A generated column cannot read other tables, so the write helpers keep them up to date. Each one is rebuilt from the row by a single SQL statement that runs in the same `db.batch` (one transaction over HTTP) as the write that changed its inputs:

- `refreshClientSearch`: name + home city + notes.
- `refreshTripSearch`: title + client name + destination name.
- `refreshAdvisorPlaceSearch`: place name + city + note. `advisor_places.place_name` is copied from `places.name` on save.
- Renaming a client also rewrites `trips.client_name` and `trips.search` for that client's trips (`updateClientFields`).

New rows get their uuid in JS (`randomUUID()`), so the insert and the refresh can share one batch. Queries go through `lib/search/trgm.ts`: a substring `ilike`, `%` similarity, or `word_similarity >= 0.45`, ranked by word similarity. That threshold is what lets "Anna Ruis" find "Ana Ruiz".

## Other invariants

- `trip_places` is unique on `(trip_id, place_id)`. `upsertTripPlaces` keeps the stronger source (seed < ask < advisor < manual) and the best score together with its explainability and tags. The same rules live in `lib/trips/merge.ts` for duplicates inside one call.
- `trip_places.status` follows the itinerary: a place in a slot is `added`, otherwise `suggested`. `removed` is never overwritten.
- `createTrip` writes the trip, its chat and its travelers in one batch and sets `trips.chat_id`.
- The stage is computed by `computeStage` in `lib/trips/stage.ts` and never stored, except as a manual `stage_override`.

## Adding a column

1. Add it to the domain file in `lib/db/schema/` (additive: nullable or with a default).
2. Do not run `drizzle-kit generate` or `migrate` in a worktree. To try it out, run `npx drizzle-kit push` against your own Neon branch (`.env.local`).
3. If the column feeds a search, add it to that table's `refresh*Search` statement.
4. Add it to the domain's `contracts.ts` types and selects. Describe the change in your report: the integrator generates one migration per merge.

## Tests

`npm test` runs Vitest. The database tests use real queries against the Neon branch in `.env.local`, loaded by `lib/db/__tests__/setup.ts`, and they skip when `DATABASE_URL` is missing. Each run uses its own owner id and entity id prefix, and `cleanup()` in `lib/db/__tests__/fixtures.ts` deletes exactly those rows.
