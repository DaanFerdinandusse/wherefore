# Tastebrief

An itinerary builder with an agent, for travel advisors and hotel concierge teams. The advisor sets up a trip in a booking-style bar, the client's saved favorites drive the first search, the agent refines it in a chat that keeps running through reloads, and the result is a day-by-day itinerary shared with the traveler as a link. Every recommendation says why: the client's taste and the advisor's own saved places.

Read `AGENTS.md` for the working agreements and `docs/PLAN.md` for the full design.

## Stack

Next.js 16 (App Router, React 19), AI SDK 7 with the Vercel Workflow DevKit (`WorkflowAgent`, durable and resumable turns), a Codex OAuth provider for the model, Neon Postgres with Drizzle, Google Maps and Places (New), Tailwind v4 tokens.

Everyone enters the same shared demo workspace without signing in. Trips, clients, and saved places belong to the stable `tastebrief-demo` owner. Existing account workspaces stay separate. No Neon Auth configuration is required.

## Run it

```bash
npm install
cp .env.example .env.local      # fill in the values
npm run db:migrate              # applies drizzle/*.sql
npm run codex:import            # imports ~/.codex/auth.json into codex_credentials
npm run dev
```

Useful scripts:

| Script | What it does |
|---|---|
| `npm run typecheck`, `npm run lint`, `npm test` | TypeScript, ESLint, Vitest (DB tests use `DATABASE_URL`) |
| `npm run copy:audit` | fails on provider names or em dashes in UI code |
| `npm run db:generate` / `db:migrate` / `db:push` / `db:studio` | drizzle-kit |
| `npx tsx --conditions=react-server scripts/seed-demo.ts --owner tastebrief-demo` | demo clients, places and trips for an account (see `docs/DEMO.md`) |
| `npx tsx --conditions=react-server scripts/qloo-smoke.ts` | live check of the recommendation client |
| `PORT=3105 AGENT_DEV_TOOLS=1 PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/chat` | the chat reliability scenarios against a dev server on that port |

## Where things live

- `lib/db/schema/*.ts`: the tables, split by domain. `lib/contracts.ts`: the shared types.
- `lib/clients`, `lib/trips`, `lib/places`: scoped queries and mutations (every call takes a scope).
- `lib/qloo`: the recommendation client (cache, fallbacks, normalization, explainability). `lib/google`: Places details and the photo proxy.
- `lib/codex`: the ChatGPT subscription provider (encrypted token row, refresh lease). `lib/agent`: tools, prompt, persistence, routes. `workflows/chat-turn.ts`: one durable turn.
- `components/ui`: the primitives from the designs. `components/trip`: the workspace (board, rail, map, profile, chat dock, itinerary, traveler view). `components/clients`, `components/places`, `components/trips`, `components/new-trip`, `components/share`: the screens.
- `app/s/[token]`: the public traveler page.

## Deploy

Vercel project `tastebrief`. Deploy with `vercel deploy --prod --archive=tgz`. Env vars are the ones in `.env.example`; Workflows run on Vercel's Workflow backend automatically.
