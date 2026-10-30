# lib/agent: the durable chat runtime

A trip has one or more chats (`trips.chat_id` is the first; the trip page opens
`?chat=<id>` or the most recently active one). Everything below is per chat id:
the lock, the run, the stream; tools write to the chat's trip. A chat's title
is its first visible advisor message, set with the first turn's lock. A turn is one Workflow run (`workflows/chat-turn.ts`) that
keeps going when the tab closes, refreshes or drops offline; any tab re-attaches
to the run's durable stream. `chats.messages` is the transcript, the run stream
is the live log. Structure follows Daan's agent-core (start, prompt, stop, get,
subscribe), with the in-memory registry, ring buffer and turn lock replaced by
the Workflow run, its stream and a conditional UPDATE.

| File | Owns |
| --- | --- |
| `chat-store.ts` | Every write to a `chats` row and its `chat_turns` record: turn lock, run id, message upsert, pending save, release, stop flag, title. A trip's chats: list, default chat, create (reuses an empty one). |
| `chat-title.ts` | `chatTitleFrom`: the first visible advisor message cut to a short line. Pure. |
| `chat-routes.ts` | Route schemas, ownership check, lazy healing (lock and pending save), `loadChatSnapshot` for server components. |
| `turn-state.ts` | Pure decisions: what a run status read means, which stream a reconnect gets, what a repeated turnId gets. |
| `route-handler.ts` | `chatRoute()`: requireUser, typed errors to JSON. |
| `stream.ts` | `ChatStreamPart` (the run stream) and `createChatUIChunkTransform` (stream to UI chunks). Pure. |
| `turn-stream.ts` | Reading a run's stream: the route response, and `readTurnMessage` for persistence. |
| `messages.ts` | `finalizeTurnMessage`, `projectTurnMessage`, `toModelHistory` (saved tool outputs through each tool's `toModelOutput`, then `budgetHistory`). Pure. |
| `history.ts` | `trimHistory` for `prepareStep`; `budgetHistory`, the total token budget of the history a turn starts from. Pure. |
| `prompt.ts`, `trip-context.ts` | System prompt with the trip header (as a `<trip_data>` block) and the seed-turn brief; `TripContextOutput`, capped under about 3k tokens. |
| `writes.ts` | Every tool write: the turn guard inside the write statement (`lib/trips/turn-guard.ts`), keyed upserts. |
| `explain.ts` | explainStep: one model call per ask that only picks favorites, shared tags and one snippet index from the input; the sentence is a template rendered in code. |
| `taste-overlap.ts` | Which favorite a place is most like and on which tags: `withOverlap`, `likeLine` ("Like Via Carota: Italian, warm, stylish"), `mediaDriver`, `tagPhrase`. Pure and client safe: the cards render the same line. |
| `tools/index.ts` | The tool set for a turn (`toModelOutput` per tool), `activeToolsFor` (seed turn). |
| `tools/steps.ts` | Every `"use step"` function, and nothing else (keeps server code out of the workflow bundle). |
| `tools/*.ts` | The tool bodies: `seed-trip`, `find-places`, `score-places`, `place-tools` (lookup, itinerary, remove), shared `search-core`, `trip-data`, pure `signals`, `category-loop`, `labels`, `model-output`, `notes` (agent slot notes). |
| `dev-setup.ts`, `tools/dev-fixtures.ts` | Dev trip and chats for the chat lab; the seeded Lisbon trip for `e2e/chat/tools.spec.ts`. |

## Tools

| Tool | Input | Output (`details`, the card reads it) |
| --- | --- | --- |
| `seed_trip` | `{}`, forced on step 0 of the seed turn only | `FindPlacesOutput` with `kind: "seed"`, `steps`, `summary: SeedSummary` |
| `get_trip_context` | `{}` | `TripContextOutput` |
| `find_places` | `{ intent, category?, tags?, price_max?, area?, near?, around_place_id?, around_day?, radius_m?, day_hint?, target?, discovery?: "less_known", michelin?, take? }` | `FindPlacesOutput` (phases searching, scoring, explaining, done). `near` is the exact circle from the map's Search this region (`lib/map/region-prompt.ts`); it wins over `area` and may lie outside the destination. Everything else searches a circle from `tools/search-area.ts`: a named spot, that day's places, the hotel, the middle of the itinerary, or the city center, widening only when too few places match. The agent chooses the anchor, the code does the geometry |
| `score_places` | `{ place_ids?, names?, scope?: "advisor_places" }` | `ScorePlacesOutput` |
| `lookup_place` | `{ place_id }` | `LookupPlaceOutput` |
| `set_itinerary` | `{ days: [{ day, slots: [{ slot, place_id, note? }] }], mode }` | `SetItineraryOutput` (notes stored as agent notes) |
| `remove_place` | `{ place_id, replace }` | `RemovePlaceOutput`. Like `lookup_place`, `set_itinerary` and `around_place_id`, it takes a name as well as an id (`tools/place-name.ts`), because old tool results are trimmed from the model's history. A name that fits several trip places changes nothing and lists them; `set_itinerary` in replace mode then keeps the whole itinerary |

The model never reads `details`: `toModelOutput` (tools/model-output.ts) gives it a compact copy wrapped in `<trip_data>`, because client names, ground rules and advisor notes are typed by people. Ids the model passes back (`place_id`) are trip place ids; place ids are accepted too. Provider calls are logged with `logTripCall` (source `seed`, `ask:<id>`, or `manual` for score_places and a replacement outside an ask). The spike tools (`echo_places`, `slow_count`) exist only with `AGENT_DEV_TOOLS=1` outside production (playwright.config.ts sets it); their places never reach the board (`extractChatPlaces` reads only find_places, seed_trip and remove_place).

## Invariants

- **The lock is `chats.active_turn_id`.** The prompt route takes it, appends
  the user message and inserts the `chat_turns` record in one statement. The
  statement also checks that the turnId was never recorded and that a re-sent
  message id is the last user message, so the check and the write see the
  same transcript. Same turnId while it runs: stream that run. Same turnId
  after it finished: the recorded outcome (the saved answer, header
  `x-chat-turn: replay`), no new run. Another turn: 409 `conflict:chat`.
- **The handoff cannot be cancelled.** Lock, `start()` and run registration
  run as one promise registered with `after()`; the response only reads the
  stream afterwards, and `supportsCancellation` is on for the listener route
  only. A failed `start()` marks the turn record failed first, so a GET heals
  the lock at once even if the release failed.
- **Unknown is not failed.** Healing releases a lock only when the run is
  confirmed terminal or missing (`WorkflowRunNotFoundError`). A status read
  that throws anything else leaves the lock for the next read.
- **A reply is never dropped before the lock goes.** If persistTurn cannot
  read or save the reply it writes `chats.pending_run_id` (+ `pending_turn_id`,
  `pending_since`) while it still holds the lock; GET rebuilds the message
  from that run's stream within the 23 h retention and clears the record. If
  even that write fails, the catch path keeps the lock and the heal path
  reconciles from the stream.
- **Stop is confirmed.** The 15 s fallback cancels, polls the run for up to
  20 s, and only releases on a confirmed terminal status; otherwise the lock
  stays with `stop_requested_at` and GET cancels again after 45 s and
  finishes it once the run is over.
- **A reconnect is bound to its run.** The client sends `x-chat-run-id` (or
  `?runId=` / `?turnId=`); if the chat moved on to another run the listener
  answers 205 `x-chat-stream: reset`, and the client re-reads the transcript
  and attaches to the new run from chunk 0.
- **An interrupted tool is an error.** A tool part that only has preliminary
  outputs when the turn ends becomes `output-error` "Interrupted"; its last
  preliminary output stays in `interruptedOutput` for the card, never in the
  model history.
- **Every turn write is conditional on `active_turn_id = turnId`** (persist,
  idle, failed, tool writes). A cancelled or superseded run cannot touch a newer
  turn. Message writes are upserts by id, so a step replay never duplicates.
- **A tool write is guarded in its own statement**, never checked first: the
  insert or update carries `exists (chat locked by this turn, stop_requested_at
  is null ... for share)` (`lib/trips/turn-guard.ts`), so nothing lands after
  Stop or a lock change. Only the places cache and taste tags (caches, not trip
  state) keep a check right before the write (`cacheWrite`).
- **Finishing a turn finishes its board state.** Asks carry `turn_id`; the
  release (`releaseTurn`, and `finalizeTurnRecords` on the kept-lock failure
  path) turns every still running ask of the turn into done (with the places
  it found) or failed, and a `seed_status = 'running'` into failed. seed_trip's
  `finally` does the same for a seed stopped at a yield.
- **Retries resume, they do not repeat.** find_places checkpoints search,
  scoring and explaining on its ask (`trip_asks.checkpoint`), the ask's
  result set is authoritative (`addAskPlaces(..., { replace: true })`), call
  logs are upserted on (tool call, step, index), and a replacement is saved
  with its link on the removed place (`replaced_by`, `replacement_key`).
- **Every search runs on one signal set.** `lib/trips/trip-signals.ts` reads it
  for find_places, score_places, remove_place and the UI's replace: favorites
  of every profiled traveler (places, then artists and films), blended advisor
  places, then the itinerary's places (`tripPickRoom`: about half the favorites,
  at most 8). Favorites stop at `MAX_FAVORITE_SIGNALS` and share that room:
  travelers take turns, and artists and films keep a part of each list.
  Advisor places and itinerary places are plain drivers ("Your places", "This
  trip's picks"): they keep their share of the match and never read as
  something the client loves. An itinerary change moves the signal hash, so
  newer evidence wins on the next search (`lib/trips/evidence.ts`).
- **Searches do not repeat.** find_places excludes the itinerary and the removed
  places (capped at `MAX_EXCLUDED`, the request URL has a limit), upstream and
  again in code. A rerun (remove_place, the UI's replace) excludes those first,
  then the rest of the trip, and `pickReplacement` checks every place on the trip.
  A place that was only shown stays available for another slot, which also lets
  a retried search find its own results.
- **Search options stay on the ask.** `discovery: "less_known"` (popularity below
  `LESS_KNOWN_POPULARITY_MAX`), `michelin` and the open day are stored in the ask
  query (`popularityMax`, `michelin`, `openDay`, with `resolvedTags`, `priceMax`
  and `resolvedArea`), sent on the main and the fill call, and read back by
  remove_place and the UI's replace through one reader (`askRerunOfQuery`), so a
  rerun stays the same search. `openDayOf` (`tools/labels.ts`) derives the day: a
  target's real date with exact trip dates, else a day hint that names one
  weekday, never for a stay. Advisor places admitted into the ask meet the same
  filters; unknown hours or popularity do not count against them, and stored
  hours that say closed keep them out even when the search dropped the open day,
  as they do for search results (`findPlaces`). A card with no hours for that day
  reaches the model as `hours_unknown`.
- **Loosening is never silent.** Every filter findPlaces drops is a `loosened`
  code with copy in `LOOSENED_COPY`: the search row and the model say what changed
  and what to check. A replacement is one place, so its note (`replacementNote`)
  says only what that place needed (`PlaceResult.loosened`), and a different kind
  of place than the one removed.
- **The model chooses on facts.** Top candidates score within about 0.01, so
  `factsForModel` (`tools/model-output.ts`) gives find_places, score_places and
  every card the provider's review keywords, dishes, price level, rating, known,
  Michelin, one verbatim description (`about`) and `practical` tags by family,
  with the ground rules beside the find_places candidates. An unknown fact stays
  out, so a missing family reads as unknown, never as no. Slot notes do not count
  these as quotable facts: `quotesFact` accepts any sentence that contains a fact,
  so a short tag ("Accepts reservations") would admit a sentence that adds invented
  hours around it.
- **Reasons are templates.** The model picks favorites, shared tags and one
  description snippet by index; anything not in the input is dropped and a
  place with no valid favorite gets no reason (`explain.ts`).
- **"Like" is chosen in code.** Driver shares are nearly flat, so the explain
  step (`explainCards`) compares tags, read once per search from the `places`
  rows: cuisine, culinary style, ambience and decor only, empty words out, a tag
  every candidate carries worth nothing, a cuisine worth more than a mood. Only
  the favorite of the best overlap carries `tags` on its driver row, stored in
  the `explainability` jsonb of `trip_places` and `ask_places` and in the
  checkpoint; at least 2 tags, at most 3, else no line and the "Because Ana
  loves ..." sentence stays. A plain driver, an artist or film (`media` on the
  row) and the place itself are never the favorite. Newer evidence for a place
  replaces its drivers and clears its reason (`upsertTripPlaces`), so tags and
  reason are written again together here and never disagree. A replacement
  (remove_place, the UI's replace) has no explain step: no line.
- **Agent slot notes are for the advisor only** (`note_source = 'agent'`,
  `note_for_traveler` false), with hours, prices and reservation claims
  stripped unless they quote a stored fact (`tools/notes.ts`).
- **persistTurn is the only writer of the assistant message**, and it saves what
  the client saw: it writes a `turn-marker` to the run stream and folds the
  stream up to that marker with `readUIMessageStream`. Stop and failure paths
  await the agent first, so the partial output is complete.
- **One stream per run.** Preliminary tool outputs go on the main stream as
  `tool-output-preliminary` parts; no namespace stream.
- **The stream stays open until the turn is saved and the lock released**
  (`preventClose`, closed in the workflow's `finally`). A client that sees
  `finish` can reload and find the saved message.
- **History for stateless Codex calls** keeps reasoning parts with their
  encrypted content, stable assistant ids (`a-<turnId>`), and every tool call
  paired with its result; trimming only cuts before a user message.
- **Tool effects must be idempotent by toolCallId** (asks, trip places, ask
  places, slots are upserts keyed on it), because Workflow retries steps.
- **Step modules do not import `server-only` at the top.** The workflow bundle
  strips step bodies and their imports; a bare side-effect import would survive
  and throw in the sandbox. Their dependencies (chat-store, db) may.

## Spike answers (PLAN 14 step 0)

0. **Model reference.** Neither works as is. A string is resolved inside the
   model step with `gateway.languageModel()` (do-stream-step.ts), never with the
   registry, so it goes to the AI Gateway. A provider object is serialized with
   its `WORKFLOW_SERIALIZE` hook, which keeps JSON config only and drops the
   custom `fetch` (codexFetch). Solution: `lib/codex/workflow-model.ts`, a
   serializable `RegistryModel` handle that serializes to `"codex/gpt-6-luna"`
   and resolves the real model inside the step from the registry that
   `instrumentation.ts` installs as `globalThis.AI_SDK_DEFAULT_PROVIDER`.
1. **Generator tools.** WorkflowAgent `await`s `execute` and does not iterate an
   async generator, and `createModelCallToUIChunkTransform` drops unknown part
   types (data parts too). So tools stay generators, a step drives them
   (`tools/run-tool.ts`) and writes each yield as `tool-output-preliminary`;
   our transform maps it to `tool-output-available { preliminary: true }`. The
   tool card renders phases from the tool part itself; after reload only the
   final output exists. `AppDataParts['tool-progress']` is not needed.
2. **Codex replay.** Encrypted reasoning replays inline across a multi-step
   tool loop and across turns (stored in UI reasoning parts as
   `providerMetadata.openai.reasoningEncryptedContent`). Codex currently ends
   streams with `response.completed`; the `response.done` rename stays as a
   guard (`codexWireStats.responseDoneRenamed` counts it).
3. **Projection vs stream.** They agree for completed steps
   (`messages.test.ts`), but an aborted model step never reaches
   `result.messages`, so persistence reads the stream. The projection is kept
   and tested.
4. **Stop.** Hook resume aborts the model call and the running tool (abort
   signal reaches the step); persistTurn saves the partial message with
   `metadata.stopped`. The 15 s cancel fallback lives in the stop route.
5. **Transport.** `WorkflowChatTransport` appends `?startIndex=<UI chunks
   received>` itself, so `prepareReconnectToStreamRequest` returns the bare
   stream URL. The route replays the run from 0 and skips that many UI chunks.
   A 204 makes the transport throw, so the client turns it into a bare finish.

## Running it

```bash
npm run codex:import          # once per branch: ~/.codex/auth.json into codex_credentials
npm run dev                   # Local World: runs in .workflow-data/, no Vercel link needed
curl localhost:3000/api/health/model           # passive: config, credential row, token expiry
curl -H "authorization: Bearer $HEALTH_SECRET" 'localhost:3000/api/health/model?probe=1'  # one real call, 1/min
open localhost:3000/chat-lab  # the dock on a dev trip; ?chat=<id> for a given chat
npx workflow web              # inspect runs and steps
PORT=3000 PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/chat
```

## Weighing

`weigh.ts` is the agent choosing out loud. After a search is scored and explained, one model call gives every candidate a stand (pick, backup, out) and one honest line, and may ask for one more search. The call is streamed, so each line reaches the card the moment the model has written it. find_places (`tools/find-places.ts`) runs the extra search into the same result set and weighs the new places against the pick. These words are model-written, unlike `explain.ts`, so `weigh.ts` holds them to the facts: a line that names a favorite or claims hours, prices or reservations falls back to the shared taste. A failed call keeps the search's own order.

The verdicts live on the ask (`query.verdicts`), so a line follows its place into the itinerary and survives a reload. Scores are dealt out again in the agent's order. `recommend_place` always takes the weighed pick, whatever id the model passes.

## Speed

What the advisor waits on before seeing places: find_places streams a place as soon as a search step has checked it (`preview`, from `findPlaces`' `onStage`), before it is on the trip. When the first step comes back short, `findPlaces` asks the other steps at once and reads them in order, and `/entities` chunks go out together. Call logs are written next to the places, not before them. Explaining and weighing are model calls that do not need each other, so they run side by side.
