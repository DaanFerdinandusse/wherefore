# lib/agent: the durable chat runtime

One chat per trip. A turn is one Workflow run (`workflows/chat-turn.ts`) that
keeps going when the tab closes, refreshes or drops offline; any tab re-attaches
to the run's durable stream. `chats.messages` is the transcript, the run stream
is the live log. Structure follows Daan's agent-core (start, prompt, stop, get,
subscribe), with the in-memory registry, ring buffer and turn lock replaced by
the Workflow run, its stream and a conditional UPDATE.

| File | Owns |
| --- | --- |
| `chat-store.ts` | Every write to a `chats` row: turn lock, run id, message upsert, release, stop flag. |
| `chat-routes.ts` | Route schemas, ownership check, lazy healing, `loadChatSnapshot` for server components. |
| `route-handler.ts` | `chatRoute()`: requireUser, typed errors to JSON. |
| `stream.ts` | `ChatStreamPart` (the run stream) and `createChatUIChunkTransform` (stream to UI chunks). Pure. |
| `turn-stream.ts` | Reading a run's stream: the route response, and `readTurnMessage` for persistence. |
| `messages.ts` | `finalizeTurnMessage`, `projectTurnMessage`, `toModelHistory`. Pure. |
| `history.ts` | `trimHistory` for `prepareStep`. Pure. |
| `prompt.ts`, `trip-context.ts` | System prompt with the trip header (as a `<trip_data>` block) and the seed-turn brief; `TripContextOutput`, capped under about 3k tokens. |
| `writes.ts` | Every tool write: conditional on `chats.active_turn_id = turnId`, keyed upserts. |
| `explain.ts` | explainStep: one model call per ask, each reason validated against the facts it got. |
| `tools/index.ts` | The tool set for a turn (`toModelOutput` per tool), `activeToolsFor` (seed turn). |
| `tools/steps.ts` | Every `"use step"` function, and nothing else (keeps server code out of the workflow bundle). |
| `tools/*.ts` | The tool bodies: `seed-trip`, `find-places`, `score-places`, `place-tools` (lookup, itinerary, remove), shared `search-core`, `trip-data`, pure `signals`, `category-loop`, `labels`, `model-output`. |
| `dev-setup.ts`, `tools/dev-fixtures.ts` | Dev trip and chats for the chat lab; the seeded Lisbon trip for `e2e/chat/tools.spec.ts`. |

## Tools

| Tool | Input | Output (`details`, the card reads it) |
| --- | --- | --- |
| `seed_trip` | `{}`, forced on step 0 of the seed turn only | `FindPlacesOutput` with `kind: "seed"`, `steps`, `summary: SeedSummary` |
| `get_trip_context` | `{}` | `TripContextOutput` |
| `find_places` | `{ intent, category?, tags?, price_max?, area?, day_hint?, take? }` | `FindPlacesOutput` (phases searching, scoring, explaining, done) |
| `score_places` | `{ place_ids?, names?, scope?: "advisor_places" }` | `ScorePlacesOutput` |
| `lookup_place` | `{ place_id }` | `LookupPlaceOutput` |
| `set_itinerary` | `{ days: [{ day, slots: [{ slot, place_id, note? }] }], mode }` | `SetItineraryOutput` |
| `remove_place` | `{ place_id, replace }` | `RemovePlaceOutput` |

The model never reads `details`: `toModelOutput` (tools/model-output.ts) gives it a compact copy wrapped in `<trip_data>`, because client names, ground rules and advisor notes are typed by people. Ids the model passes back (`place_id`) are trip place ids; place ids are accepted too. Provider calls are logged with `logTripCall` (source `seed`, `ask:<id>`, or `manual` for score_places and a replacement outside an ask). The spike tools (`echo_places`, `slow_count`) exist only with `AGENT_DEV_TOOLS=1` outside production (playwright.config.ts sets it); their places never reach the board (`extractChatPlaces` reads only find_places, seed_trip and remove_place).

## Invariants

- **The lock is `chats.active_turn_id`.** The prompt route takes it and appends
  the user message in one conditional UPDATE. Same turnId again: stream that
  run. Another turn: 409 `conflict:chat`.
- **Every turn write is conditional on `active_turn_id = turnId`** (persist,
  idle, failed, tool writes). A cancelled or superseded run cannot touch a newer
  turn. Message writes are upserts by id, so a step replay never duplicates.
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
curl localhost:3000/api/health/model
open localhost:3000/chat-lab  # the dock on a dev trip; ?chat=<id> for a given chat
npx workflow web              # inspect runs and steps
PORT=3000 PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/chat
```
