# Tastebrief: working agreements

Read `docs/PLAN.md` first. It is the full build plan: data model, agent runtime, screens, behaviors, build order. `PRODUCT.md` is the product truth. `QLOO_API_FINDINGS.md` is what the recommendation API actually returns. The designs are in Paper (file "qloo", page "v2 Itinerary builder"); the Paper MCP tools can screenshot any artboard by name.

## Code like Daan codes

Before writing code in your area, read how Daan's own projects do the same thing and reproduce the structure, not the code:

- `/Users/daanferdinandusse/agent-core`: `AGENTS.md`, `shared/agent-core/README.md`, `shared/agent-core/api/*` (chat lifecycle: start, prompt, stop, get, subscribe), `shared/agent-core/hooks/*` (pure event reducer, optimistic pending prompt, reconnect logic), `shared/db` (barrel with `contracts.ts` so two backends cannot drift), `components/message-parts.tsx` (tool cards branch on tool name and read `details`).
- `/Users/daanferdinandusse/itinerary-canvas`: `features/*` slices, `shared/agent-core/api/openai-codex-auth.ts` (Codex credential store), `features/itinerary-agent/agent-config.ts`, the canvas live-streaming pattern (live partial state vs canonical state keyed by tool call id).

What to keep: small slices with a README, barrels with a `contracts.ts` type check, pure reducers with tests, per-chat write queues, idempotent writes keyed by ids, a `details` payload for the UI next to the `content` the model reads, plain SQL thinking even through Drizzle, copy that names the action.

What to replace: pi-agent-core and pi-ai become AI SDK 7 `WorkflowAgent` and tools; tRPC SSE becomes route handlers plus `WorkflowChatTransport`; the in-memory registry, ring buffer and turn lock become the Workflow run, its durable stream and a DB conditional update; the file credential store becomes the `codex_credentials` row with a lease.

What to strip: attachments, usage ledger and budgets, plan tiers, `ask_user`, model selection, prompt suggestions, Supabase siblings, anonymous owners, the canvas artifact store. If a piece from those repos is not in `docs/PLAN.md`, leave it out.

## Hard rules

- No em dashes anywhere: not in UI copy, not in comments, not in commit messages. Use a comma, a colon or a full stop.
- The UI never names the data provider. Say "recommended", "match" or "taste match". The word "Qloo" is allowed only in server code, env names and docs.
- Never invent facts about a place. Cards and sentences show only what the API returned (names, tags, explainability, descriptions). A reason that cannot be grounded stays empty.
- Do not copy code from `/Users/daanferdinandusse/aivisor`. `/Users/daanferdinandusse/agent-core` and `/Users/daanferdinandusse/itinerary-canvas` are references for API shape and the Codex auth protocol only.
- TypeScript strict, no `any`, no `@ts-ignore`. Zod 4 for every external payload.
- Server-only modules import `server-only`. Keys never reach the client bundle.
- Plain, direct language in copy. Controls name their action. Errors name the problem and the recovery.

## Stack

Next.js 16 App Router (React 19, Node 22+, ESM), Tailwind v4 tokens in `app/globals.css`, AI SDK 7 + `@ai-sdk/workflow` + `workflow` (Vercel Workflow DevKit), Drizzle on Neon (`drizzle-orm/neon-http`), Neon Auth (`@neondatabase/auth`, v0.2+ API: `createNeonAuth`, `auth.getSession()`, `auth.handler()`), `@vis.gl/react-google-maps`, zustand. Package docs: `node_modules/next/dist/docs/` for Next (this version differs from training data), and context7 for the others.

## Shared contracts

- `lib/contracts.ts`: the types the server, the tools and the UI share (`TripPlaceCard`, `Ask`, `ItinerarySlot`, `TripSnapshot`, tool outputs, `AppUIMessage`). Add fields when you need them; never rename or remove without telling the other owners.
- `lib/db/schema/*.ts`: Drizzle schema, split by domain (`core.ts`, `chat.ts`, `cache.ts`). Add columns in your own domain file. Do not run `drizzle-kit generate` or `migrate` in a worktree; describe the schema change in your report and the integrator generates one migration per merge. For local testing use `npx drizzle-kit push` against your own Neon branch (your `.env.local`).
- `app/globals.css`: the only place colors and type sizes live. Use the token classes (`bg-surface`, `text-text-2`, `font-display`, `label-caps`, `glass`, `film`, `arch-top`, `glow-ring`, `rise-in`).

## Working in a worktree

- Your worktree has no `.env.local` and no `node_modules`. Run `ln -s /Users/daanferdinandusse/qloo/node_modules node_modules` and copy the env file named in your brief from `/Users/daanferdinandusse/qloo/.env.agents/` to `.env.local`, then append `TURBOPACK_ROOT=/Users/daanferdinandusse` to it so `next dev` resolves packages through the symlink. If you add a dependency, run `npm install <pkg>` (it lands in the shared `node_modules`) and say so in your report.
- Signatures in `lib/clients`, `lib/trips`, `lib/places` take a trailing `scope` (an owner id, `{ ownerId, orgIds }` or the `AuthUser` from `requireUser()`); out-of-scope rows return null or throw `NotFoundError`. Route handlers map errors with `errorResponse(e)` from `lib/auth/errors.ts`.
- Touch only the files and folders your brief lists as yours. If you must change a shared file (`lib/contracts.ts`, `package.json`, `app/globals.css`, `app/layout.tsx`), keep the change minimal and additive and call it out in your report.
- `npm run typecheck` and `npm run lint` must pass before you report done. Write Vitest tests for pure logic.
- Commit on your branch with clear messages. Do not merge, rebase or push.

## Conventions

- Files and symbols use the product's words: trip, client, traveler, ask, trip place, slot, your place, advisor place.
- Route handlers start with `requireUser()` from `lib/auth/server.ts` except `/api/auth/*`, `/s/*`, `/api/health/*`.
- Queries live in `lib/<domain>/queries.ts`, writes in `lib/<domain>/mutations.ts`. Write helpers maintain the `search` columns.
- Components: `components/ui` for primitives, `components/<area>` for screens. Server components by default; `"use client"` only where there is state or an effect.
- Copy audit before done: `grep -rn "Qloo" app components` must return nothing, and `grep -rn "—" app components lib` must return nothing.
