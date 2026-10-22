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
| `prompt.ts`, `trip-context.ts` | System prompt with the trip header; the trip context read with Drizzle. |
| `tools/*` | One file per tool step; `tools/index.ts` builds the tool set for a turn. |
| `dev-setup.ts` | Dev trip and chats for the chat lab and the e2e tests. |

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
