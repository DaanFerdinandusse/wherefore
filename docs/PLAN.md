# Tastebrief: full app build plan

## Context

The v2 designs in Paper (file `qloo`, page "v2 Itinerary builder", 20 artboards) and `PRODUCT.md` define a B2B itinerary builder for travel advisors and concierge teams. The advisor sets up a trip in a booking-style bar, the client's saved favorites drive a first search for places, the advisor refines with a durable chat agent, picks places into a day-by-day itinerary, and shares a read-only link with the traveler. Every recommendation shows why: the client's taste (explainability from the recommendation API) and the advisor's own saved places and notes.

This plan turns those designs into a working app. The repo is `/Users/daanferdinandusse/qloo` (currently only docs and design assets, not yet a git repo). Nothing is built yet. The Qloo hackathon deadline is 30 Oct 2026.

Decisions already made with Daan (2026-10-21):

- Model access: his ChatGPT/Codex subscription through OAuth (the way `itinerary-canvas` does it with pi), default model `gpt-6-luna`. Not an API key.
- Agent runtime: Vercel AI SDK 7 with the Workflow DevKit (`WorkflowAgent`, `WorkflowChatTransport`), hosted on Vercel. Fire and forget: a turn keeps running when the tab closes, refreshes or loses network, and any tab can re-attach to the stream.
- Database and auth: new Neon project, Neon Auth (Managed Better Auth), Drizzle ORM.
- Search: Postgres `pg_trgm` on Neon, not Elasticsearch.
- Teams: single user now; every row carries `owner_id` and a nullable `org_id` so a team list can be added later. The Mine/Team toggle ships but Team is only shown when an org exists.
- Maps and photos: Google Maps JavaScript API for the dynamic map, Google Places (New) for photos and details in the place profile. Card images come from the recommendation API's own `images[]` first (no quota, no caching restriction), Google photos as fallback and for the profile gallery.
- Not in scope: attachments, budget tracking, model selection, a question/ask-user tool, prompt suggestions, booking, routing, payments.
- UI never names the data provider. Copy says "recommended", "match", "taste match". No em dashes anywhere in copy or code comments. Do not copy code from the earlier travel advisor project (`aivisor`); the agent-core and itinerary-canvas repos are references for API shape and the Codex auth protocol only.

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16 App Router, React 19, TypeScript strict, Node 22, ESM | AI SDK 7 needs Node 22 and ESM. Next config wrapped in `withWorkflow()` from `workflow/next`. |
| Styling | Tailwind v4 with `@theme` tokens in `app/globals.css` | All colors and type from the Paper design system (section 12). No hex in components. |
| Fonts | `next/font/google`: Bodoni Moda 400, Hanken Grotesk 300/400/500 | Display vs UI, as in the designs. |
| Agent | `ai@7`, `@ai-sdk/workflow@2`, `workflow@5`, `zod@4` | `WorkflowAgent` + `WorkflowChatTransport`. Not `DurableAgent`, not `resumable-stream`. |
| Model provider | Custom Codex OAuth provider on top of `@ai-sdk/openai` (`createOpenAI({ baseURL, fetch })`) with a DB-backed token store | Section 6.3. Model id `gpt-6-luna`, override with `AGENT_MODEL`. |
| DB | Neon Postgres, `@neondatabase/serverless` over HTTP, `drizzle-orm/neon-http`, `drizzle-kit` migrations | `DATABASE_URL` pooled at runtime, `DATABASE_URL_UNPOOLED` for drizzle-kit. `db.batch()` for atomic multi-writes. |
| Auth | `@neondatabase/auth` v0.2+ (`createNeonAuth`, `auth.getSession()`, `auth.handler()`), email+password and Google | `proxy.ts` with `auth.middleware()` protects `/app/*`. |
| Maps | `@vis.gl/react-google-maps` (Map, AdvancedMarker, useMap), a Cloud map style on a map ID with a warm muted look | Browser key referrer-restricted to Maps JS only. |
| Places | Places API (New) from server routes only, server key API-restricted | Photos proxied through a route with `Cache-Control`; photo names never stored. |
| Client state | `zustand` for the trip workspace store (board, map, highlight, selection) | Chat state is `useChat`. |
| Search | `pg_trgm` GIN indexes on generated `search` columns | Section 11. |
| Hosting | Vercel, Fluid compute, Workflows (Redis-backed streams), AI Gateway not used | `supportsCancellation` on streaming routes. |

## 2. Repository layout

```
app/
  (auth)/sign-in, sign-up            Neon Auth UI pages
  (app)/layout.tsx                   app bar: Trips, Clients, My places, search, + New trip
  (app)/trips/page.tsx               A Trips overview (home)
  (app)/trips/[tripId]/page.tsx      trip workspace shell (board | map | itinerary), chat dock,
                                     place profile sheet driven by ?place=<tripPlaceId>
  (app)/clients/page.tsx             B Clients
  (app)/clients/[clientId]/page.tsx  C/C2 Client profile (same screen for new)
  (app)/places/page.tsx              E My places
  s/[token]/page.tsx                 05 Traveler view (public, read only)
  api/auth/[...path]/route.ts        auth.handler()
  api/chats/[chatId]/route.ts        GET rehydrate
  api/chats/[chatId]/messages/route.ts   POST prompt (starts a run, streams)
  api/chats/[chatId]/stream/route.ts     GET listener (resume by startIndex)
  api/chats/[chatId]/stop/route.ts       POST stop
  api/health/model/route.ts          Codex provider check
  api/places/photo/route.ts          Google photo proxy
  api/places/[placeId]/google/route.ts   Google details on demand
  api/search/route.ts                CRM search
  api/import/takeout/route.ts        Google Takeout CSV import (stretch)
workflows/
  chat-turn.ts                       'use workflow': one agent turn (the first turn of a trip is the seed, section 8)
lib/
  db/schema.ts, db/index.ts          Drizzle schema and client
  auth/server.ts, auth/client.ts
  qloo/client.ts, qloo/types.ts, qloo/normalize.ts, qloo/cache.ts
  google/places.ts, google/photos.ts
  codex/provider.ts, codex/token-store.ts, codex/refresh.ts
  agent/tools/*.ts, agent/prompt.ts, agent/messages.ts (UI projection)
  trips/queries.ts, trips/mutations.ts, clients/queries.ts, places/queries.ts
  search/trgm.ts
components/
  shell/, trip/board/, trip/map/, trip/itinerary/, trip/chat/, trip/place-profile/
  clients/, places/, new-trip/, share/
  ui/ (pill, button, avatar, arch-photo, match-pill, tabs, menu, calendar)
drizzle/                             migrations
scripts/seed-demo.ts                 demo advisor, clients, places (section 13)
```

## 3. Data model (Drizzle, Postgres)

All app tables have `id uuid pk default gen_random_uuid()`, `owner_id text not null` (Neon Auth `user.id`), `org_id text null`, `created_at`, `updated_at`. Row access is "owner_id = session user or org_id in user's orgs" in every query helper; no RLS for now. `search text` columns are plain columns filled by the write helpers (they combine fields from other tables, which a generated column cannot read), indexed with `gin (search gin_trgm_ops)`.

- `advisors`: `user_id text unique`, `display_name`, `home_city`, `taste_tags jsonb` (the advisor's own taste portrait, computed from their places), `blend_my_taste boolean default false`.
- `clients`: `name`, `home_city`, `home_lat`, `home_lon` (double precision, null), `avatar_url null`, `notes`, `ground_rules jsonb` (list of strings like "No tasting menus"), `media_favorites jsonb` (artists, films with resolved entity ids), `taste_tags jsonb` (cached taste portrait: `[{tag_id, name, type, score}]`), `taste_tags_at timestamptz`, `search text` (name + home_city + notes), `status text` (active, archived, guest).
- `client_favorites`: `client_id fk`, `query text` (what the advisor typed or imported), `entity_id text null` (resolved id), `place_id uuid fk null` (row in `places`), `match text` (resolved, unmatched, weak), `candidates jsonb` (top 3 search results for the "no match" tile), `position int`.
- `places`: the cache of every place the app has touched, keyed by `entity_id text unique`. `name`, `address`, `city`, `neighborhood`, `lat`, `lon`, `primary_type`, `types jsonb`, `price_level int null`, `rating numeric null`, `rating_count int null`, `description`, `images jsonb` (provider image urls), `tags jsonb`, `properties jsonb` (raw block for the profile: hours, phone, website, keywords, descriptions), `google_place_id text null`, `google_cid text null`, `fetched_at`. Not owned by anyone (no owner_id). Refreshed via `/entities?entity_ids=` when older than 30 days.
- `advisor_places` (My places): `place_id fk`, `city`, `note text`, `tags jsonb`, `saved_at`, `last_used_at`, `place_name text` (denormalized), `search text` (place name + city + note). Unique `(owner_id, place_id)`. "In N trips" is a count over `trip_places where source = 'advisor'`.
- `trips`: `client_id fk`, `title` (e.g. "Lisbon for Ana"), `destination jsonb` (`{name, disambiguation, lat, lon, radius_m, country_code}` from locality search), `start_date date null`, `end_date date null`, `dates_mode text` (exact, unset), `adults int`, `children int`, `stage_override text null` (planning, shared, traveling, done; the computed stage is planning → shared when a token exists → traveling when today is within the dates → done after `end_date`, and a drag on the Trips board sets the override), `share_token text unique null`, `shared_at`, `chat_id uuid fk`, `seed_status text` (pending, running, done, failed), `built_from jsonb` (the "Built from" box: favorites used, advisor place count, companions without favorites, rules), `client_name text` (denormalized), `search text` (title + client name + destination).
- `trip_travelers`: `trip_id fk`, `client_id fk null` (null for a guest without profile), `name`, `role text` (client, guest), `drives_search boolean`.
- `trip_asks`: one per board tab beyond the category tabs. `trip_id fk`, `label` (e.g. "Natural wine · Sat"), `query jsonb` (normalized request: tags, category, price, area, day), `tool_call_id text`, `chat_message_id text`, `status text` (running, done, failed), `result_count int`, `elapsed_ms int`, `created_at`.
- `trip_places`: one row per place per trip. `trip_id fk`, `place_id fk`, `source text` (seed, ask, advisor, manual; highest priority source wins), `category text` (eat, drink, coffee, see, stay, other; from `primary_type` re-check), `best_affinity numeric`, `best_score int` (0..100 display score from its best set), `explainability jsonb` (`[{entity_id, name, share}]` per client favorite, from its best set), `shared_tags jsonb`, `advisor_place_id fk null` ("Your place"), `reason text null` (one grounded sentence, nullable until explained), `status text` (suggested, added, removed), `position int`. Unique `(trip_id, place_id)`.
- `ask_places`: tab membership, because a place can appear in several asks with different ranks. `ask_id fk`, `trip_place_id fk`, `rank int`, `affinity numeric`, `score int`, `explainability jsonb`. Unique `(ask_id, trip_place_id)`. Category tabs read `trip_places.category`; ask tabs read `ask_places`.
- `itinerary_slots`: `trip_id fk`, `day int`, `date date null`, `slot text` (morning, lunch, afternoon, dinner, night, stay), `trip_place_id fk null`, `note text`, `position int`. Unique `(trip_id, day, slot, position)`.
- `chats`: `trip_id fk unique`, `status text` (idle, running, failed), `active_turn_id text null` (client-minted idempotency key and lock), `active_run_id text null` (Workflow run id), `stop_requested_at timestamptz null`, `last_error text null`, `messages jsonb not null default '[]'` (full `UIMessage[]`, overwritten on each save), `updated_at`.
- `chat_events` is not needed: the Workflow stream is the live log and `chats.messages` is the durable transcript.
- `trip_calls`: `trip_id fk`, `endpoint text`, `params jsonb` (key params only, no signals longer than 10 ids), `count int`, `ms int`, `loosened jsonb`, `source text` (seed, ask id, profile, manual), `created_at`. Feeds the "How we got this" panel.
- `api_cache`: `key text pk` (hash of endpoint + sorted params), `body jsonb`, `expires_at`. Used by the Qloo client (insights 24 h, search 7 d, entities 30 d) because cold combos take 8 to 10 s.
- `codex_credentials`: `id text pk default 'default'`, `access_token_enc`, `refresh_token_enc` (AES-GCM under `CODEX_TOKEN_KEY`, a 32-byte env var; the id token is not needed for requests and is not stored), `account_id`, `expires_at`, `last_refresh`, `refresh_lease_until timestamptz null`, `updated_at`. One row for the app's subscription. Section 6.3.
- `share_views` (optional): `trip_id`, `viewed_at`, for "Ana opened it".

Indexes: trgm GIN on `clients.search`, `trips.search`, `advisor_places.search`, `places.name`; btree on `trip_places(trip_id, status)`, `ask_places(ask_id, rank)`, `itinerary_slots(trip_id, day)`, `advisor_places(owner_id, city)`, `trips(owner_id, updated_at desc)`, `trip_calls(trip_id, created_at)`.

## 4. External clients

### 4.1 Recommendation client (`lib/qloo/*`)

Server only. Base URL and key from env. One `qlooGet(path, params)` that validates params against an allowlist per endpoint (bad params are silently ignored upstream, so the client throws on unknown keys), caches by key in `api_cache`, retries once on 5xx, throttles bulk calls sequentially. Functions, all mapped from `QLOO_API_FINDINGS.md`:

- `searchEntities(query, {types, location?, take})` → `/search`. Place search biased to the client's home city coordinates. Returns candidates with address for disambiguation.
- `resolveLocality(name)` → `/search?types=urn:entity:locality`, returns candidates with lat/lon and disambiguation. Destination picker uses this; trips store `POINT(lon lat)` + radius, never free text.
- `findPlaces({destination, signals, tags?, excludeIds?, priceMax?, take, page})` → `/v2/insights` with `filter.type=urn:entity:place`, `filter.location=POINT(lon lat)&filter.location.radius`, `signal.interests.entities`, `feature.explainability=true`. Verifies `query.localities.filter[0].disambiguation` matches.
- `scoreEntities({destination?, signals, entityIds})` → insights with `filter.results.entities`.
- `tastePortrait(signals)` → insights `filter.type=urn:tag` with `filter.tag.types=ambience,cuisine,decor`.
- `findTags(text)` → `/v2/tags?filter.query=` for mapping "natural wine" to tag ids.
- `getEntities(ids)` → `/entities?entity_ids=` for re-hydration and the 30-day refresh.
- `normalizePlace(raw)` → the `places` row shape; extracts `external.google_place` (array in insights, object in search) into `google_place_id` and `google_cid`.
- `categoryOf(place)` from `properties.primary_genre` and tags, re-checked after each filtered query because the category filters are loose.
- `displayScore(affinity, setAffinities)`: affinities bunch at 0.79 to 0.80, so the card score is rank-based within the result set (top = 94 and downward), not the raw decimal. Document this in the "How we got this" panel.
- `explainabilityFor(result, favorites)` → `[{entity_id, name, share}]` with shares rounded to integers that sum to 100.
- Fallbacks: if a filtered query returns fewer than 5, rerun without `filter.tags`, then without `filter.price_level`, and return `loosened: string[]` so the UI can say what changed.

### 4.2 Google (`lib/google/*`)

- `placeDetails(placeId, tier)`: Places (New) `GET /v1/places/{id}` with a field mask per tier. `basic` (Pro: displayName, googleMapsUri, primaryType, businessStatus, photos, location) when a profile opens; `full` (Enterprise + Atmosphere: rating, userRatingCount, regularOpeningHours, websiteUri, nationalPhoneNumber, priceLevel, reviews, editorialSummary) only for the scrolled profile section, fetched when it scrolls into view. Per-request cache in memory for 10 minutes by place id; nothing persisted except `google_place_id`.
- `photoUrl(name, maxWidthPx)` is a proxy route `GET /api/places/photo?name=...&w=...` that fetches `/v1/{name}/media` with the server key and returns the image with `Cache-Control: public, max-age=3600`. Shows `authorAttributions` under the gallery.
- Map: `APIProvider` with the browser key, `Map` with `mapId` (vector, Cloud style: saturation -45, gamma 0.9, water #cbb9a0, landscape #efe6d8, POIs off, road strokes off, labels in ink). One map load per trip workspace; Board/Map toggle keeps the map mounted but hidden to avoid reloads.

### 4.3 Codex OAuth model provider (`lib/codex/*`)

Reproduces what `itinerary-canvas` does through pi-ai 0.87.1 (`features/itinerary-agent/agent-config.ts`: provider `openai-codex`, `gpt-6-sol`, SSE; `shared/agent-core/api/openai-codex-auth.ts`: file-backed credential store on a Railway volume). On Vercel the file becomes a DB row and the single Node process becomes a lock. The protocol, read from pi-ai's `api/openai-codex-responses.js` and `auth/oauth/openai-codex.js`:

- Endpoint: `POST https://chatgpt.com/backend-api/codex/responses`, SSE.
- Headers: `Authorization: Bearer <access JWT>`, `chatgpt-account-id` (JWT payload `["https://api.openai.com/auth"].chatgpt_account_id`), `originator: pi` (the value is whitelisted upstream; send what itinerary-canvas sends and do not experiment), `OpenAI-Beta: responses=experimental`, `accept: text/event-stream`, `session-id` and `x-client-request-id` = chat id (also used as `prompt_cache_key`, max 64 chars).
- Body: standard Responses API with these constraints: `store: false` (the endpoint rejects `true`), `stream: true`, the system prompt in `instructions` (not in `input`), `include: ["reasoning.encrypted_content"]`, `reasoning: { effort, summary: "auto" }`, `text: { verbosity: "low" }`, `parallel_tool_calls: true`, `tool_choice: "auto"`, no `max_output_tokens`, no `prompt_cache_retention`, no `previous_response_id`; reasoning items are replayed inline with their encrypted content on later turns.
- Stream: standard Responses events, except the run can end with `response.done` instead of `response.completed`; `response.failed` and `error` events are errors; 429 bodies with `usage_limit_reached` carry `plan_type` and `resets_at`.
- Refresh: `POST https://auth.openai.com/oauth/token`, form-encoded `grant_type=refresh_token&refresh_token=…&client_id=app_EMoamEEZ73f0CkXaXp7hrann`; response has `access_token`, rotated `refresh_token`, `expires_in` seconds; account id re-derived from the new JWT.
- Models available on the subscription: `gpt-6-luna` (default here), `gpt-6-sol`, `gpt-6-astra`, `gpt-5.6-*`.

Implementation is in section 6.3.

## 5. Auth and tenancy

- Neon Auth with `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET`. `lib/auth/server.ts` exports `auth = createNeonAuth(...)`, `app/api/auth/[...path]/route.ts` exports `auth.handler()`, `proxy.ts` exports `auth.middleware({ loginUrl: '/sign-in' })` with matcher `['/trips/:path*', '/clients/:path*', '/places/:path*', '/api/(chats|trips|places|search|import)/:path*']` (route groups are not in URLs; `/s/:path*` and `/api/health` stay public).
- `requireUser()` helper for route handlers and server components (`force-dynamic` where used). Returns `{ userId, orgIds: [] }` for now.
- First sign-in creates the `advisors` row (name from the auth user, home city asked once in a small banner on the Trips page).
- Sign-in page: email + password and Google button, in the design system (warm surface, Bodoni wordmark). Dev uses Neon's shared Google credentials; production needs an own OAuth client and trusted domains for the Vercel origins.
- Public share page `/s/[token]` is outside the middleware matcher.

## 6. Agent runtime: durable chat

### 6.1 API (the agent-core shape, chat-scoped)

| Route | Purpose | Input → Output |
|---|---|---|
| `GET /api/chats/[chatId]` | re-hydrate | → `{ chat: { id, tripId, status, activeRunId, messages: UIMessage[], lastError } }` |
| `POST /api/chats/[chatId]/messages` | prompt (fire and forget + stream) | body `{ message: UIMessage }` (only the new user message; history is loaded server-side) → UI message stream, headers `x-workflow-run-id`, `x-chat-id` |
| `GET /api/chats/[chatId]/stream?startIndex=n` | listener | resolves `chats.active_run_id`; if none, returns 204; else replays `getRun(runId).getReadable({ startIndex: 0 })` through `createModelCallToUIChunkTransform({ uiStartIndex: n })`, plus the `ui` namespace stream merged (section 6.4) |
| `POST /api/chats/[chatId]/stop` | stop | resumes the run's stop hook, falls back to `getRun(runId).cancel()` after 5 s, clears `active_run_id`, persists the partial assistant message from the stream (section 6.5) |

Turn lock and idempotency: the client mints a `turnId` (uuid) per send. The prompt route does `update chats set status='running', active_turn_id=$turnId where id=$id and active_turn_id is null returning id`. If no row returns and `active_turn_id = $turnId`, it is a repeat of the same send: respond with that run's stream (`getRun(active_run_id).getReadable`). If it is a different turn, respond 409 `conflict:chat`. On success the route appends the user message, calls `start(chatTurn, [{ chatId, turnId }])`, stores `active_run_id`, and streams. If `start()` throws, both columns are cleared. Healing: a `running` chat whose `getRun(active_run_id).status` is completed, failed or cancelled is reconciled on the next `GET` (clear the lock, persist what the stream has if the workflow did not), so there is no boot reset.

### 6.2 The workflow (`workflows/chat-turn.ts`)

```
export async function chatTurn({ chatId, turnId }) {
  'use workflow';
  const input = await loadTurnInput(chatId, turnId);   // 'use step': messages, trip context, system prompt
  const stop = createHook('stop:' + turnId);           // resumed by the stop route
  const controller = new AbortController();
  const agent = new WorkflowAgent({ model: 'codex/gpt-6-luna', instructions: input.instructions, tools,
    stopWhen: [isLoopFinished(), isStepCount(12)], prepareStep });
  const result = await Promise.race([
    agent.stream({ messages: input.modelMessages, writable: getWritable<ModelCallStreamPart>(), abortSignal: controller.signal }),
    stop.then(() => { controller.abort(); return 'stopped' as const; }),
  ]);
  await persistTurn({ chatId, turnId, result });       // 'use step', the only writer of chats.messages for this turn
  await markIdle(chatId, turnId);                      // 'use step'
}
```

`start()` receives only `{ chatId, turnId }`; the transcript is read inside the first step so the run payload stays small and replay is deterministic (step results are persisted).

Model reference: the workflow body is replayed in a sandbox, so a provider object holding a closure (`codexFetch`) may not survive. The Codex provider is therefore registered as the AI SDK default provider through a registry (`createProviderRegistry({ codex: codexProvider, openai })`) in `instrumentation.ts`, and the agent receives the string `'codex/gpt-6-luna'`. Spike item 0 confirms this; if `WorkflowAgent` accepts a `LanguageModel` object directly, that is the simpler path and the registry stays only for the `AGENT_PROVIDER` switch.

- `instructions` (`lib/agent/prompt.ts`): role, the never-invent rule (only state facts returned by tools: names, tags, explainability, descriptions), the "whose judgment" rule (say when a place is the advisor's), short replies, no provider names, no em dashes, and the trip context header (client name, destination, dates, travelers, rules) rendered server-side into the system prompt on each turn.
- Every tool `execute` is a `'use step'` function so it retries and persists; tool steps also write rows to the DB (section 7) and stream progress.
- `prepareStep` trims history to the last 30 messages and strips large tool outputs older than the last 3 steps (keeps ids and names) to control tokens.
- Model call `timeout: 60_000`.

### 6.3 Codex OAuth provider

- `lib/codex/token-store.ts`: `getCredential()` reads `codex_credentials` row `default`. If `expires_at` is within 5 minutes (pi refreshes exactly at expiry with no buffer; we refresh early), it takes a lease with one compare-and-set statement (`update codex_credentials set refresh_lease_until = now() + interval '30 seconds' where id = 'default' and (refresh_lease_until is null or refresh_lease_until < now()) returning *`). The winner posts to `auth.openai.com/oauth/token` and writes back `access_token`, the rotated `refresh_token`, `account_id`, `expires_at`, `last_refresh`, and clears the lease. Losers poll the row every 500 ms for up to 10 s until `expires_at` moves, then use the new token. A CAS lease is used instead of an advisory lock because the HTTP driver has no interactive transactions. The rotated refresh token is why single-flight matters: a racing second refresh fails. Seeded once by `scripts/codex-import-auth.ts` from `~/.codex/auth.json` (`tokens.access_token`, `tokens.refresh_token`, `tokens.account_id`; the id token is dropped), encrypted at rest with `CODEX_TOKEN_KEY`. `CODEX_AUTH_JSON` env var is an alternative seed for the first boot on Vercel; the row always wins after that.
- `lib/codex/provider.ts`: `createOpenAI({ baseURL: 'https://chatgpt.com/backend-api/codex', apiKey: 'unused', fetch: codexFetch })` and `codexModel = (id) => provider.responses(id)`. `codexFetch(url, init)`:
  1. gets the credential, sets the headers from 4.3;
  2. parses the JSON body, forces `store: false`, `stream: true`, `include: ['reasoning.encrypted_content']`, moves any leading system/developer message from `input` into `instructions`, deletes `max_output_tokens`, `prompt_cache_retention`, `previous_response_id`, `temperature` unless explicitly set, sets `text.verbosity` and `prompt_cache_key` (chat id) when missing;
  3. pipes the response through a `TransformStream` that renames `event: response.done` to `response.completed` if the AI SDK parser does not accept it (checked in the spike);
  4. on 401 refreshes once and retries; on 429 with a usage-limit body throws a typed `CodexUsageLimitError` with `resetsAt` so the dock can say "Subscription limit reached, resets in 40 min".
  Provider options for every call: `providerOptions.openai = { store: false, reasoningEffort: 'low', reasoningSummary: 'auto', include: ['reasoning.encrypted_content'] }` so the fetch rewrite has little to do.
- Reasoning replay: AI SDK 7 keeps encrypted reasoning in the assistant message's provider metadata when `include` has `reasoning.encrypted_content`; verify in the spike that multi-turn tool loops send it back inline (Codex is stateless).
- `lib/codex/health.ts`: `GET /api/health/model` runs a 5-token call for the deploy check; a settings row shows "Subscription connected · refreshed 2 h ago".
- Fallback: `AGENT_PROVIDER=openai` switches `codexModel` to `@ai-sdk/openai` with `OPENAI_API_KEY`. One line, kept working in CI, for demo day insurance.
- Known caveats, stated once in the README: undocumented endpoint, OpenAI's CI guidance is one credential per runner, every visitor's turn bills Daan's plan, usage limits are per plan.

### 6.4 Streaming, progress and custom tool UI

- Client: `useChat({ id: chatId, messages: initial, resume: Boolean(activeRunId), transport: new WorkflowChatTransport({ api: '/api/chats/{id}/messages', prepareSendMessagesRequest: ({ messages }) => ({ body: { message: messages.at(-1), turnId } }), prepareReconnectToStreamRequest: ({ startIndex }) => ({ api: '/api/chats/{id}/stream?startIndex=' + startIndex }), onChatEnd }) })`. On mount and on `visibilitychange`, resume re-attaches. Second tab works the same way because the active run id is server-side. Spike confirms whether the transport appends `startIndex` itself when `api` is overridden; the route defaults it to 0.
- Tool parts render by `part.type` (`tool-find_places`, `tool-score_places`, `tool-get_trip_context`, `tool-set_itinerary`, `tool-lookup_place`) and `part.state` (`input-streaming`: the search card with a spinner and the query chips filling in; `input-available`: "Searching …"; `output-available`: the result card; `output-error`: the error with a Retry button that re-sends the same ask).
- Progress and live places go through the main stream, not a second one: a second stream cannot share the resume cursor. Each tool `execute` is an async generator that yields preliminary outputs `{ phase: 'searching' | 'scoring' | 'explaining', found, total, elapsedMs, places: TripPlaceCard[] }` and returns the final output. AI SDK 7 streams these as the tool part's `output-available` state with `preliminary: true`, so the F7 card phases render from the tool part itself, and the same part re-renders from `chats.messages` after reload (final state only). Spike item 1 confirms generator tools work inside `'use step'` with `WorkflowAgent`; the fallback is `data-*` parts written to the main writable, and only if that fails too, a namespace stream with its own cursor.
- The client folds each preliminary and final tool output into the zustand trip store (board cards and map pins appear before the model finishes talking). On reload, the same places come from the DB (`trip_places`, `ask_places`), so nothing on the board depends on stream replay.
- The search card (F7, F7b): map thumbnail (static map image of the destination with result dots, from the Maps Static API, or a styled canvas if cost matters), title "Searched natural wine bars", details line, "12 found · 1.4 s", 150 px photo tiles with score, bookmark for advisor places, name, type, a "+8" tile, then steps "Score your places" and "Explain picks" with counts. Hovering a tile sets `highlightedPlaceId`; clicking opens the place profile.

### 6.5 Persistence of messages

- Source of truth is `chats.messages` as `UIMessage[]`. The prompt route appends the user message and saves before starting the run (so a crash still shows the user's message).
- `persistTurn` step: `WorkflowAgent.stream()` returns `ModelMessage[]`; `lib/agent/messages.ts` projects them to one assistant `UIMessage` (text parts, reasoning parts dropped, `tool-*` parts in state `output-available` with input and output, ids = tool call ids) and appends it. Verify in the spike that the projection matches what the live stream rendered; if it drifts, switch to reading the run's own stream with `readUIMessageStream` in that step.
- Stop: the stop route sets `chats.stop_requested_at` and resumes the hook `stop:<turnId>`. The workflow aborts the model call, and `persistTurn` (the only writer) saves what the aborted stream produced with `metadata.stopped = true`, then `markIdle` clears the lock. Only if the chat is still `running` 15 s later does the route call `getRun(runId).cancel()` and do the partial save itself from the run stream (`getReadable({ startIndex: 0 })` through the transform and `readUIMessageStream`). The client clears its run id on stop so `resume` does not reattach.
- Failure: the workflow's catch step sets `chats.status='failed'`, `last_error`, clears the lock; the dock shows the error with Retry (re-sends the same user message with a new `turnId`).
- Hobby stream retention is 1 day, so reload never depends on stream replay for finished turns.

### 6.6 Reliability tests (must pass before UI polish)

Scripted with Playwright against a preview deployment:
1. Send a prompt, close the tab after the first tool starts, reopen after 20 s: full reply present, tool cards in final state, board shows the places.
2. Send, refresh mid-stream: stream continues from the current index with no duplicate text.
3. Two tabs: both show the same stream; stop in one stops both.
4. Network drop (offline 10 s) during a reply: resumes after reconnect.
5. Double submit with the same client run id starts one run.
6. Stop mid-stream: partial text saved, status idle, next prompt accepted.
7. Tool error (force a 500 from the recommendation client): error card, Retry works.

## 7. Agent tools (`lib/agent/tools/*`)

Few and simple. All server steps, all write to the DB and stream progress.

| Tool | Input | What it does | Output (what the model sees) |
|---|---|---|---|
| `seed_trip` | `{}` | The first turn's deterministic setup (section 8). Only active on the seed turn. | the structured summary |
| `get_trip_context` | `{ include?: ['travelers','advisor_places','board','itinerary'] }` | Loads the trip, travelers with favorites and taste tags, the advisor's places in this city with notes and current scores, the board summary (counts per tab, added places), the itinerary. | Compact JSON, max 3k tokens. Called automatically on the first turn via `prepareStep` (tool choice forced). |
| `find_places` | `{ intent: string, category?: eat/drink/coffee/see/stay, tags?: string[], price_max?: 1..4, area?: string, day_hint?: string, take?: 8..20 }` | Three idempotent sub-steps, each keyed by `tool_call_id` so Workflow retries are safe: `searchStep` (`findTags` for free text, `findPlaces` with the trip's signals, upsert `trip_asks` by `tool_call_id`, upsert `places`, `trip_places`, `ask_places`; yields `phase: 'searching'` with the places), `scoreAdvisorStep` (`scoreEntities` for the advisor's places in the city, marks "Your place"; yields `phase: 'scoring'`), `explainStep` (one `generateText` call with `gpt-6-luna` over the tool's own result JSON asking for `{ place_id, reason }` pairs, each validated to mention only names and tags present in the input, stored on `trip_places.reason`; yields `phase: 'explaining', done, total`). Fallbacks loosen filters and return `loosened`. | `{ ask_id, label, count, elapsed_ms, loosened, places: [{ id, name, category, score, because: [{name, share}], shared_tags, your_place, note, reason }] }` |
| `score_places` | `{ place_ids?: string[], names?: string[], scope?: 'advisor_places' }` | Scores the advisor's places or a named shortlist for the client. Names are resolved with `searchEntities` biased to the destination. | ranked list with scores and drivers |
| `lookup_place` | `{ place_id }` | Full place facts from the `places` cache (descriptions, keywords, hours, price, tags) for a grounded sentence. | the properties block, trimmed |
| `set_itinerary` | `{ days: [{ day, slots: [{ slot, place_id, note? }] }], mode: 'replace' | 'merge' }` | Writes `itinerary_slots`; only `trip_places` of this trip are allowed, unknown ids are returned as rejected. Streams `data-itinerary`. | `{ applied, rejected }` |
| `remove_place` | `{ place_id, replace: boolean }` | Marks `trip_places.status='removed'`; with `replace`, reruns the place's originating query with `filter.exclude.entities` and adds the next best. | the replacement, if any |

Rules enforced in code, not only in the prompt: tool outputs carry only provider facts; per-card `reason` sentences come only from `explainStep` (also used by `seed_trip` for the first list), never from the main reply; a reason that fails validation stays null and the card shows the drivers only. Every tool's `execute` is an async generator yielding the phases above (section 6.4).

Each ask becomes a board and map tab: label from the tool input (`intent` + `day_hint`), with a spinner while running and the count when done, an × that archives the ask (places stay, tab hides).

## 8. Trip creation and the seed workflow

New trip bar (F1 to F4), a panel over the current page:

- For who: 4 most recent clients (avatar, home city, favorites count, next trip), "Find a client" search (pg_trgm), "New client" opens the client screen in a sheet and returns with the created client selected. Prefilled when opened from a client profile (D).
- Where: locality search as you type (`resolveLocality`), each row with disambiguation and a badge "N of your places" from `advisor_places` grouped by city; suggestions "Where you have the most places" and "Client went before" (from past trips).
- When: two-month calendar range picker, Exact dates / Not set yet, footer "Fri 14 to Tue 18 May · 4 nights", Clear, "Next: travelers".
- Travelers: the client (drives the search), guests with or without a profile ("Add favorites" opens a mini favorites picker that creates a client with status guest), adults and children steppers.
- Create trip is enabled when who and where are set. It creates `trips`, `trip_travelers`, `chats`, then starts the chat's first turn (below) and navigates to `/trips/[id]`.

The seed is the first chat turn, so there is one streaming and persistence mechanism, not two. The create action appends a synthetic user message `{ text: 'Set up the trip', metadata: { hidden: true, kind: 'seed' } }` (not rendered) and starts `chatTurn`. `prepareStep` sees `kind: 'seed'` on step 0 and forces `toolChoice: { type: 'tool', toolName: 'seed_trip' }` with `activeTools: ['seed_trip']`; later steps allow all tools. The `seed_trip` tool (one `'use step'`, no model inside):
1. `resolveSignals`: favorites' entity ids for every traveler with a profile (companions without favorites are listed in `built_from`), advisor places in that city.
2. `tastePortrait` for the client if older than 7 days.
3. Five `findPlaces` calls (eat, drink, coffee, see, stay) with `take=8`, sequential (rate limits), category re-checked, kept to about 20 to 30 places in total (the header shows the real count); each writes `trip_places(source='seed')` and yields a preliminary output ("Searching places to eat · 3 of 5", with the places so far) so the board fills category by category. Then `explainStep` for the shown places.
4. `scoreEntities` for the advisor's places in the city, marks `advisor_place_id` ("Your place"), keeps weak matches with their low score.
5. Writes `built_from`, sets `seed_status='done'`, returns the structured summary (counts per category, advisor place names and scores, companions without favorites, rules).

The model then writes the agent's first message (F6: what was used, how many places, which are the advisor's, what to ask next) from that summary only. The board header reads "20 places for Ana" with the subtitle from `built_from`. While seeding, the board shows skeleton cards per category, and the dock shows the seed tool card with its progress line. If the seed step fails after retries, `seed_status='failed'` and the board shows "Could not build the first list" with a Retry that re-sends the synthetic message.

## 9. Screens and behaviors (mapped to the Paper artboards)

Desktop first at 1440, usable down to 1024. All screens share the app bar (Trips, Clients, My places, search field, + New trip, avatar).

- **A Trips overview** `/trips`: four stage columns (planning, shared with client, traveling now, done) of trip cards (city photo from the destination's top place image, client avatar, title, dates, counts). The stage is computed (section 3, `trips`); drag between columns sets `stage_override`. Empty state with "+ New trip". The glass dock here is a lighter "assistant" that only links to trips (no model call in v1; shows nudges computed in SQL: "Marcus leaves in 3 days, itinerary has 2 empty days").
- **B Clients** `/clients`: rows with avatar, name, home city, favorites thumbnails (first 4 place images), next trip, status, last activity; search box over `clients.search`; "+ New client" goes to `/clients/new`.
- **C / C2 Client profile** `/clients/[id]` and `/clients/new`: one screen, edit in place. Name is an inline editable title with the editing underline and "Saved as you type" (debounced PATCH, optimistic). Avatar upload is out of scope: a dashed initial avatar. Trips panel: upcoming card, past trips, "New trip for Ana" (opens the trip bar prefilled), empty state "Plan her first trip". Taste profile panel: places she loves grid (favorites with image, name, city), "Add a place" tile that turns into a search input with a dropdown of candidates (name, address, and "Import Google Maps saved places" at the bottom, shown disabled with "Soon" until the Takeout importer ships), unmatched favorites shown as dashed "no match" tiles with the candidates to pick from or remove; "Also into" artists and films (search `urn:entity:artist|movie`); top taste tags ("Her taste so far" when fewer than 3 favorites); ground rules as removable chips with an add field. Taste tags recompute after each favorites change (debounced server action).
- **D New trip from a profile**: the trip bar with For who prefilled, Where suggestions from the advisor's cities and the client's past trips.
- **F1 to F4 New trip bar**: section 8.
- **F6 / 02 Discover board** `/trips/[id]` (default view): top bar with trip switcher, Discover / Itinerary / Traveler view tabs, "How we got this", "Share itinerary". Header "20 places for Ana" with filter pills All, Eat, Drink, Coffee, See, Stay plus one pill per ask (✦ label, spinner or count, ×). Grid: a featured card (largest, arch top on the first card) and photo cards with the match pill (rank score), "Your place" badge, "Your note" row, + button (adds to the next free slot or opens a slot picker), hover glow when highlighted from chat or map. Right rail: itinerary by day with slot rows (empty slots dashed), drag a card onto a slot. Bottom: glass chat dock with the message list (section 6.4), the composer, and the Board/Map toggle centered above it.
- **02b Discover map / F8 / F7b**: same shell, map fills the content area. Pins: photo pins (48 px round photo, score chip) for suggested places, numbered ink pins for itinerary places, small score dots when zoomed out (declutter by zoom level and by overlap), bookmark mark for advisor places, an off-map chip for places outside the viewport ("Casa Barragán · 12 min north" is not allowed: no distances we do not have; show direction arrow only). Ask results: pins get a glowing amber border and are 25 percent larger; non-result pins fade to 40 percent. A dashed "…" placeholder pin appears while results arrive (position from the first streamed result). Hover from chat: `panTo` the place, enlarge the pin, show its label "Senhor Uva · 87 · Your place · because she loves Via Carota". Click: open the preview card; click the card: open the profile. "Search this area" button appears after the user pans (reruns the active ask with the new center and radius). Zoom controls. Map preview card shows photo, name, score, your note.
- **03 / 03b Place profile** (intercepted route, sheet over a scrim): left column arch photo ("1 of N photos" from provider images plus Google photos), two smaller photos, "See all N photos". Right: "In my places" toggle (creates or removes `advisor_places`), close; name (Bodoni 64); address, price, rating and count, open state (from Google `full` when loaded, else hidden); "Why it is recommended for Ana" block with the score, driver bars (Via Carota 52 percent, Lilia 34 percent, Attaboy 14 percent) and shared taste tags; "Your pick" outlined block (note, saved date, trips used, Edit note) when it is an advisor place; About (provider short description); actions pinned at the bottom: slot picker "Day 2 · Lunch", "Add to itinerary", "Not for Ana" (removes with replacement, through the same code path as the tool). Scrolled: compact sticky header (name, score, close); About with feature chips from provider tags; Hours (trip days bold) and Contact (address, Directions link to Google Maps with `query_place_id`, Website, Call); no Popular times section (neither API returns it; the design's chart is dropped); Reviews from Google (rating, breakdown, review cards labeled "From Google", attribution). Google data is fetched when the section mounts, never stored.
- **04 Itinerary** view: day columns with slot cards (photo, name, time slot, reason line), drag to reorder, empty slot "Add" opens the board filtered to that category, notes per slot. Same chat dock. Days come from the dates; with "Not set yet" the trip starts with 3 days and an "Add a day" column. The "Traveler view" tab renders the same component as `/s/[token]` inside the workspace, with a "Share" call to action when no token exists yet.
- **05 Traveler view** `/s/[token]`: public, no auth, `noindex`. Share bar on top (advisor name, "Prepared for Ana"), hero (destination image, title, dates), day sections with cards and "Because you love Via Carota and Lilia" lines, advisor notes marked "From your advisor", footer. Only data from our DB (names, provider images, reasons). Share button in the workspace creates the token, copies the link, sets stage to shared; "Stop sharing" revokes.
- **E My places** `/places`: photo cards (name, type and neighborhood, quoted note, "In N trips", "Last for X"), city filter pills, "Save a place" (search with destination bias, then note), card menu (edit note, remove). Rail: Mine / Team toggle (Team hidden without org), "Your taste" tags (advisor taste portrait from their places), "Blend my taste into searches" toggle (writes `advisors.blend_my_taste`; off by default, labeled unverified in the panel copy), "Save from anywhere" hint (the profile's "In my places" toggle).
- **How we got this** panel: a drawer listing every provider call for this trip (endpoint, key params, result count, time, loosened filters), read from a `trip_calls` log written by the Qloo client when a `tripId` is in scope. Add `trip_calls(trip_id, endpoint, params jsonb, count, ms, created_at)` to the schema.

Keyboard: Esc closes sheets and panels; `/` focuses the composer; arrow keys move between slot cards.

## 10. Shared client state (`components/trip/store.ts`, zustand)

```
{ tripId, view: 'board'|'map'|'itinerary', activeTab: 'all'|category|askId,
  places: Record<tripPlaceId, TripPlaceCard>, asks: Record<askId, Ask>,
  slots: ItinerarySlot[], highlightedPlaceId, selectedPlaceId, mapCamera,
  applyDataPart(part), applyServerSnapshot(snapshot) }
```
Initial snapshot from the server component; live updates from tool parts (preliminary and final outputs); mutations (add to itinerary, remove, save place) are server actions that return the new rows and patch the store. Board, map, rail, chat tiles and the profile all read from this one store, so hover and selection stay in sync. `view`, `activeTab`, `selectedPlaceId` and `mapCamera` are per-tab client state mirrored to the URL (`?view=map&tab=<askId>&place=<id>`) for deep links and the back button; only data (places, asks, slots, messages) is shared across tabs through the server.

## 11. Search

`lib/search/trgm.ts`: one function `searchRows(table, ownerScope, q, limit)` that runs `where search ilike '%'||q||'%' or search % q order by word_similarity(q, search) desc`. The `search` columns are rebuilt by the write helpers in `lib/*/mutations.ts` (and when a denormalized name changes: renaming a client rewrites its trips' `client_name` and `search`). Used by the app bar search (clients, trips, places in one grouped dropdown via `/api/search?q=`), the For who menu, Clients page, My places page. Migration enables `pg_trgm` and creates the GIN indexes.

## 12. Design system (tokens in `app/globals.css`)

- Colors: canvas #E8E3D9; surface #F1EDE6; surface-raised #FBF9F5; ink #1C1A17; text-2 #5E5850; text-3 #4A453E; avatar #DDD6CA; rule rgba(28,26,23,.12) and .16; pill-outline rgba(28,26,23,.42); nav-pill rgba(28,26,23,.55); match-pill-bg rgba(28,26,23,.55) on photos; amber #8A5A1E (warnings); glow #E2A85A with halo rgba(233,176,96,.6); green #5B6650 (traveling, open now); glass rgba(241,237,230,.6) + backdrop blur 18 px.
- Type: Bodoni Moda 400, tracking -0.025em for display (wordmark 28, section titles 48, profile name 56, place title 64, share hero 92); Hanken Grotesk for UI, 300 for card names (44/30/26), 400 body 15/16, 500 labels; uppercase labels 11 px, 0.16em tracking, 500.
- Components in `components/ui`: ink pill button, outlined pill, filter pill (active = ink fill), glass dock, hairline rule, underline search field, stadium avatar, arch photo (`border-radius: 999px 999px 24px 24px` top), starburst ornament (SVG), match pill, score chip, bookmark mark, skeleton card ("Reading why it fits Ana"), streaming cursor.
- Motion: one authored moment: new places fade and rise in as they stream (opacity + 8 px translate, 320 ms, exponential ease out), and the highlighted pin scales 1 to 1.25 with the glow. Nothing else animates except hover states.
- Photos: provider images rendered through `next/image` with a warm filter class (`saturate(.72) contrast(.9) sepia(.08)`) to match the film grade of the designs; Google photos the same.
- Browser surfaces themed: selection color, caret, focus ring (2 px amber outline offset 2 px), scrollbars thin ink at 20 percent.

## 12b. Environment and packages

Env (`.env.example` lists every one with a comment): `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `QLOO_API_KEY`, `QLOO_API_URL`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID`, `GOOGLE_PLACES_SERVER_KEY`, `AGENT_PROVIDER` (codex | openai), `AGENT_MODEL` (default `gpt-6-luna`), `CODEX_AUTH_JSON` (first-boot seed only), `CODEX_TOKEN_KEY` (32-byte key for encrypting the stored tokens), `OPENAI_API_KEY` (fallback only), `APP_URL` (for share links), `CRON_SECRET` (if the 30-day place refresh runs as a cron).

Packages (pin on install, check latest at that moment): `next@16`, `react@19`, `ai@7`, `@ai-sdk/workflow@2`, `@ai-sdk/openai` (v7-compatible major), `workflow@5`, `zod@4`, `drizzle-orm`, `drizzle-kit`, `@neondatabase/serverless`, `@neondatabase/auth` (0.4 beta, v0.2+ API), `@neondatabase/auth-ui` (optional), `@vis.gl/react-google-maps`, `zustand`, `tailwindcss@4`, `lucide-react` (icons, one stroke weight), `vitest`, `@playwright/test`. No tRPC, no React Query, no component library.

Conventions: server-only modules import `server-only`; every route handler starts with `requireUser()` except `/api/auth/*`, `/s/*`, `/api/health/*`; no `any`; copy lives in components next to its use (no i18n layer); files and symbols use the product's words (ask, trip place, slot, your place).

## 13. Demo data and seeding

`scripts/seed-demo.ts` creates the demo advisor, clients Ana Ruiz (Via Carota, Lilia, Attaboy, Devoción, Khruangbin), Marcus and two more, advisor places in Lisbon (11) and Mexico City, and one trip in each stage. Favorites are resolved live against the API at seed time, so every id is real. Images in `design/images/film/*.jpg` are used only as fallbacks for the Trips overview city cards; places use provider images.

## 14. Build order

Each milestone ends with a deploy to Vercel preview and a check of the listed behaviors.

0. **Spike (first, one day)**: new Next 16 app, `withWorkflow`, `WorkflowAgent` with two fake tools, `WorkflowChatTransport`, the Codex provider calling `gpt-6-luna` through the custom fetch with a DB token row. It must answer, in order: (0) does `WorkflowAgent` take the Codex model as a registry string or a model object; (1) do async-generator tools yield preliminary outputs through the stream and the transform; (2) does a multi-turn loop with two tool calls replay encrypted reasoning correctly against Codex, and does `response.done` parse; (3) does the ModelMessage to UIMessage projection match the live render; (4) stop hook plus partial save; (5) does the transport pass `startIndex` when `api` is overridden. Then run reliability tests 1, 2 and 6 from 6.6 on the spike app (close tab mid-turn, refresh mid-stream, stop) before milestone 1 starts. The spike lives in the real repo and becomes `workflows/chat-turn.ts` and `lib/codex/*`.
1. **Foundation**: repo init, tokens and fonts, Neon project, Drizzle schema and migrations, Neon Auth sign-in, app shell, `requireUser`, pg_trgm.
2. **Recommendation and Google clients** with the cache table, `trip_calls` logging, unit tests against recorded fixtures (and one live smoke test script).
3. **Clients CRM**: list, search, one client screen with edit in place, favorites search and no-match handling, taste tags, ground rules, media favorites.
4. **My places**: library, save with note, city pills, advisor taste tags, blend toggle.
5. **Durable chat core**: routes, `chatTurn` workflow, Codex provider in place, `get_trip_context` and `seed_trip` tools, persistence, resume, stop, reliability tests (6.6) on a bare dock. This comes before the board because the seed turn feeds it.
6. **New trip bar + board**: F1 to F4, seed turn with streaming category fill, board cards, filter pills, rail, add to slot, built-from box, "How we got this".
7. **Asks and tool UI**: `find_places`, `score_places`, `lookup_place`, `set_itinerary`, `remove_place`, the search card with photo tiles, ask tabs, progress lines, hover linking to the board.
8. **Map view**: markers, declutter, toggle, preview card, hover and click linking with the store, ask highlighting, search this area.
9. **Place profile sheet**: provider data, Google details and photos on demand, in my places toggle, actions, scrolled sections.
10. **Itinerary view + traveler share page** + share and revoke.
11. **Trips overview** with stages and nudges, empty states, error states, keyboard, final copy pass (no provider names, no em dashes), demo seed, production env (own Google OAuth client, trusted domains, keys restricted), deploy.

Stretch after 11: Google Takeout import, organizations with the Neon Auth org plugin, "score my shortlist" composer shortcut, traveler link open tracking.

## 15. Verification

- Unit: `lib/qloo/normalize.ts`, `displayScore`, `explainabilityFor`, `categoryOf`, the UI message projection, the trgm query builder (Vitest).
- Integration: route handlers with a Neon branch per CI run (`neon branches create`), seed, call, assert rows.
- Agent reliability: the seven Playwright scenarios in 6.6 against a preview deployment.
- Manual walkthrough on the preview: create client Ana with 5 favorites, create "Lisbon for Ana" (4 nights, Clara as guest), watch the board fill, ask "natural wine bars for Saturday", hover a tile and see the map move, open Black Sheep, add to Day 2 dinner, share the link in a private window, reload mid-stream twice.
- Copy audit script: grep the repo and the seed for "Qloo" in UI strings and for em dashes.

## 16. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Codex endpoint changes or rejects AI SDK body fields | Spike first; `AGENT_PROVIDER=openai` fallback with an API key wired from day one. |
| Preliminary tool outputs do not stream through the WorkflowAgent transform | Fallback order verified in the spike: `data-*` parts on the main writable, then a namespace stream with its own cursor. |
| Provider object with a custom fetch does not survive the workflow sandbox | Register the Codex provider in a registry and pass `'codex/gpt-6-luna'` as a string. |
| `ModelMessage` to `UIMessage` projection drifts from the live render | Snapshot test comparing projection vs `readUIMessageStream` of the same run. |
| Vercel Hobby limits (300 s per function, 1 day stream retention, daily cron) | Steps are short (one API call each); persistence never relies on replay; move to Pro before demo if needed. |
| Recommendation API cold calls 8 to 10 s and rate limits on parallel paging | `api_cache`, sequential category calls with streamed fill, skeletons. |
| Wrong city from the geocoder | Destination picker stores POINT + radius; response disambiguation is asserted. |
| Google costs | Qloo images on cards; Google only in the open profile, `full` tier only when the reviews section is visible; photo proxy cached. |
| Model invents facts | Tools return only provider facts; reason sentences validated against the tool output; drivers and tags rendered from data, not from the model. |
