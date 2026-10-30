# lib/db: the data slice

Drizzle on Neon over HTTP (`drizzle-orm/neon-http`). `lib/db/index.ts` holds the one client. The schema is split by domain in `lib/db/schema/{core,chat,cache}.ts`. Reads live in `lib/<domain>/queries.ts` and writes in `lib/<domain>/mutations.ts`. Every signature is declared once as a type in `lib/<domain>/contracts.ts`, and the implementations annotate their exports with those types. Import a domain through its barrel: `@/lib/clients`, `@/lib/places`, `@/lib/trips`.

## Tables

| Table | Owned | What it holds | Written by |
|---|---|---|---|
| `advisors` | yes | Profile per workspace owner: display name, home city, taste tags | `lib/auth/advisor.ts` (`ensureAdvisor` on the first request) |
| `clients`, `client_favorites` | yes (favorites through their client) | Client profile, favorites in order, rules, media, taste tags | `lib/clients` |
| `places` | no | Cache of every place touched, unique on `entity_id` | `upsertPlaces` in `lib/places` |
| `advisor_places` | yes | My places: saved place, city, private note | `lib/places` |
| `trips`, `trip_travelers` | yes (travelers through their trip) | Trip setup, stage override, share token, `built_from` | `lib/trips` |
| `trip_places`, `ask_places`, `trip_asks` | through the trip | Board cards, ask tabs and their ranked members | `lib/trips` |
| `itinerary_slots` | through the trip | Day, slot, trip place, note, `note_for_traveler` | `lib/trips` (`setSlots`, `upsertSlot`, `clearSlot`) |
| `trip_calls` | through the trip | The "How we got this" log | `logTripCall` in `lib/trips` |
| `chats`, `codex_credentials`, `api_cache` | see `chat.ts`, `cache.ts` | Agent runtime and provider cache | agent and recommendation slices |

`neon_auth.*` belongs to Neon Auth. The public demo does not read it. Legacy account maintenance scripts can still resolve previous owners from it. `drizzle.config.ts` filters it out.

## Ownership rule

A row is in scope when `owner_id = <user id>` or `org_id` is one of the user's orgs. The predicate is written once, in `inScope()` (`lib/auth/scope.ts`), and every helper applies it in SQL:

- Owned tables filter on their own columns.
- Children (favorites, trip places, asks, slots, calls) filter through their parent: `trip_id in (select id from trips where <in scope>)`, or the trip is checked first with `requireTripId`.
- Every helper takes a scope: a bare owner id, `{ ownerId, orgIds }`, or the `AuthUser` that `requireUser()` returns. Rows outside the scope read as `null` or throw `NotFoundError`. "Not yours" and "not there" are the same answer.
- Ids from URLs are checked with `isUuid` first, so a malformed id is a 404, not a 500.
- Hand-written correlated subqueries use `inScopeAs(alias, scope)`. A child id is not a scope: the client summaries filter their `trips t` subqueries by scope too, because a client id alone also matches trips another advisor wrote for it.
- A trip place's "Your place" link (`advisor_place_id`) is checked twice: `upsertTripPlaces` stores it only when the saved place is in the caller's scope and saves the same place, and the card query joins it only for the trip's own owner (or org) and the same place.
- `places` is shared and unowned. The public traveler view (`getSharedTripView`) is keyed by the share token alone, so it never reuses the advisor snapshot: it selects only traveler-facing columns and returns a `SharedTripView` (no ids, scores, asks, removed places or advisor place notes; a slot note only when `note_for_traveler` is set). `getTripTravelerView` reads the same view by trip id and scope for the advisor's preview. Both read Google's photos live (`lib/trips/traveler-photos.ts`) and never store them; a shared trip loads them from `/api/share/<token>/photo`, which serves only places on that trip's itinerary (`isSharedGooglePlace`).

Route handlers map the typed errors with `errorResponse()` from `lib/auth/errors.ts`: 401, 404, 400, 503.

## Search columns

`clients.search`, `trips.search` and `advisor_places.search` are plain text columns with trigram GIN indexes. A generated column cannot read other tables, so the write helpers keep them up to date. Each one is rebuilt from the row by a single SQL statement that runs in the same `db.batch` (one transaction over HTTP) as the write that changed its inputs:

- `refreshClientSearch`: name + home city + notes.
- `refreshTripSearch`: title + client name + destination name.
- `refreshAdvisorPlaceSearch`: place name + city + note. `advisor_places.place_name` is copied from `places.name` on save.
- Renaming a client also rewrites `trips.client_name` and `trips.search` for that client's trips (`updateClientFields`).

New rows get their uuid in JS (`randomUUID()`), so the insert and the refresh can share one batch. A trip's `client_name` is read inside the trip insert (`select name from clients ... for share`), so a rename running at the same time either lands first or waits and then rewrites the new trip.

Queries go through `lib/search/trgm.ts`: a substring `ilike`, `%` similarity, or `q <% search` (word similarity), ranked by word similarity. All three are gin_trgm_ops operators, so the index serves the whole predicate. `<%` reads `pg_trgm.word_similarity_threshold` (default 0.6); `withTrgmThreshold(query)` runs `set_config(..., '0.45', true)` and the query in one `db.batch`, so the setting lasts exactly that transaction. 0.45 is what lets "Anna Ruis" find "Ana Ruiz". A query that uses `trgmMatch` without `withTrgmThreshold` still works, at the stricter 0.6.

## Other invariants

- `trip_places` is unique on `(trip_id, place_id)`. `upsertTripPlaces` keeps the stronger source (seed < ask < advisor < manual) and the best score together with its explainability and tags. The same rules live in `lib/trips/merge.ts` for duplicates inside one call.
- `trip_places.status` follows the itinerary: a place in a slot is `added`, otherwise `suggested`. `removed` is never overwritten.
- `createTrip` writes the trip, its chat and its travelers in one batch and sets `trips.chat_id`.
- The stage is computed by `computeStage` in `lib/trips/stage.ts` and never stored, except as a manual `stage_override`. `listTrips` pages each stage in SQL with `stageSql`, the same rule written as a `case`; a test checks they agree. Each stage returns at most 30 cards (newest first) with `total` and `hasMore`, and the card counts come from grouped joins over that page.
- An ask's result count is counted from `ask_places` on read. `trip_asks.result_count` is the final count, written once by `updateAsk` when the ask moves to `done`.
- `upsertPlaces` runs one upsert per set of supplied fields, in one batch, so a row that omits `images` never resets another row's images.

## Concurrency over neon-http

`drizzle-orm/neon-http` has no interactive transactions. A `db.batch` is one transaction (READ COMMITTED), but JS cannot read a row, decide, and then write while holding a lock: every round trip is its own transaction. So:

- Writes that depend on other rows check them in SQL, inside the statement that writes. Slot writes insert from `jsonb_to_recordset(...)` and keep only rows whose trip place is on the trip and not `removed`, with `for share` on those trip place rows. A removal running at the same time either commits first (the slot row is skipped and comes back in `rejected`) or waits for the slot batch and then clears the slot in its own later statement.
- The status sync runs as the last statement of the same batch. `clearSlot` syncs and deletes in one batch: the sync runs first and ignores the slot being deleted.
- What this does not give: serializable batches. Two slot writes on the same trip at the same moment each sync statuses from their own snapshot, so a status can briefly lag until the next write on that trip resyncs it. Ownership checks (`requireTripId`) may run in a separate round trip because `owner_id` never changes.

## Adding a column

1. Add it to the domain file in `lib/db/schema/` (additive: nullable or with a default).
2. Do not run `drizzle-kit generate` or `migrate` in a worktree. To try it out, run `npx drizzle-kit push` against your own Neon branch (`.env.local`).
3. If the column feeds a search, add it to that table's `refresh*Search` statement.
4. Add it to the domain's `contracts.ts` types and selects. Describe the change in your report: the integrator generates one migration per merge.

## Tests

`npm test` runs Vitest. The database tests use real queries against the Neon branch in `.env.local`, loaded by `lib/db/__tests__/setup.ts`, and they skip when `DATABASE_URL` is missing. Each run uses its own owner id and entity id prefix, and `cleanup()` in `lib/db/__tests__/fixtures.ts` deletes exactly those rows.
