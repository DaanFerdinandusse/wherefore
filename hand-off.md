# Hand-off: v3 designs into main (night of 29 to 30 Oct 2026)

Goal: implement every screen on the Paper page "v3 Chat + itinerary" (file `qloo`, fileId `01M5FS0EN2Q9M5WSH52PAGTN2M`, pageId `p-3-0`), UI and behavior, committed straight to main. Read `AGENTS.md` first (no em dashes, never name the provider in UI, never invent facts, use the client's first name instead of her/his).

## Daan's decisions (do not revisit)

- Commit to main, do not push. Migrations go to the main Neon database (the one `.env.local` points at, used by production).
- In scope: several chats per trip, the place card's Visit info and Reviews tabs (from Google).
- Out of scope: Calendar view (H2), guest travelers with their own favorites, the "How busy" chart, the mic button.
- Creating a trip does not start a search. The advisor gives a brief, then the agent searches in small steps and recommends one place at a time. No step checklists, no "How we got this" trace. Reasons on cards are code templates over facts, never model prose.

## Done and merged on main (last commit `786a056`)

| Area | What landed |
|---|---|
| Shell | `components/shell`: AppPage, Panel, MenuButton, SectionPill, NavDrawer (`/api/nav`), AccountButton, NewTripLink. SegmentedToggle `panel` variant, Sheet `left` side. The old app bar is gone. |
| Several chats per trip | `chats.title`, GET/POST `/api/trips/[tripId]/chats`, trip page reads `?chat=`, drawer lists the open trip's chats with "New chat for this trip". |
| My places | City switcher popover, category tabs, "Scored for <client>", cards with score, note quote, trip usage. Old rail removed. |
| New trip panel | N1 to N4 restyled; copy says the trip opens a chat (no auto search). |
| Traveler page `/s/[token]` | K1 design, phone width included. Uses the advisor's sign-in email as the "Message" contact when present: **Daan should confirm this is OK.** |
| Trips page | Board and List, drag between stages, "Needs you" row, real share-open tracking ("Opened yesterday", "Not opened in 4 days"). |
| Clients | Card list, New client and client profile as modals over the list (`@modal` intercepted routes), optional client email. |
| Trip workspace | Chat column left, Itinerary / Map panel right (T3, G2), slot highlights, J1b suggestion strip, drag and drop, share review sheet (L1) and Shared popover (L2), traveler view in the panel. Discover board, rail, place sheet, How we got this and the seed kick-off are removed. ChatColumn is keyed by chat id. |

Migrations applied to the main database: `drizzle/0004_chat_titles.sql`, `0005_share_opens.sql`, `0006_client_email.sql`.

Checks on main after the last merge: typecheck pass, lint 0 errors (2 warnings in generated workflow files), 632 Vitest tests pass.

## Not finished

### 1. The chat builder's branch is not merged (the main gap)

The chat builder stopped early (usage limit) while taking its final screenshots. Its work is committed:

- Branch `worktree-agent-acb0194a75b06d5b5`, worktree `.claude/worktrees/agent-acb0194a75b06d5b5`
- `3494c77` Agent v3: no seed turn, small searches with a slot target, `recommend_place`, opening from facts
- `f82407d` Chat column v3: thread, opening from facts, search rows, recommendation card, place card over the thread
- 42 files, about 3,150 lines. One untracked scratch file `.shots-chat.ts` (do not commit).

Until it merges, the left column of the trip page is still the old chat dock (the `ChatColumn` seam in `components/trip/chat/chat-column.tsx` just wraps it).

To finish:

1. In that worktree: `npm run typecheck && npm run lint && npm test`, then `PORT=<port> PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/chat` with `AGENT_DEV_TOOLS=1 npx next dev -p <port>` running (env: `.env.agents/agent-chat.env` copied to `.env.local`, plus `TURBOPACK_ROOT=/Users/daanferdinandusse`). Fix what fails. It never wrote a final report, so read its two commit diffs to see what it did.
2. Merge into main: `git merge --no-ff worktree-agent-acb0194a75b06d5b5`. Expect conflicts in `app/globals.css` (keep both sides' tokens), `lib/contracts.ts` and possibly `components/trip/chat/*` (main has the ChatColumn seam).
3. Wire the seams the workspace builder left for it:
   - Chat tiles call `startPlaceDrag` from `components/trip/workspace/dnd.ts` so they drop onto slots.
   - `onPlaces` meta passes `target` (`PlacesMeta.target` in `components/trip/contracts.ts`) so slots show "Finding dinner in the chat" and then the suggestion.
   - `Ask.target` is **not persisted** in the database yet: add a nullable jsonb `target` column on `trip_asks` (or wherever asks live), write it when find_places creates the ask, read it in `toAsk` (`lib/trips/map.ts`). Then `npx drizzle-kit generate --name ask_target` and `npx drizzle-kit migrate` from the main checkout.
   - Streamed cards can use `placeFactsFromProperties` (`lib/trips/map.ts`) so keywords and dishes show without waiting for the next snapshot.
   - A selected place (`store.selectedPlaceId`, set by itinerary cards and map pins) must open the full place card in the chat column. Check this works after the merge.
4. If the chat builder kept the `seed_trip` code, make sure nothing on trip creation calls it.

### 2. Client card click gives a 404 on the running dev server

Clicking a card on `/clients` goes to a 404, while the direct link `/clients/<id>` works. Most likely the dev server on port 3105 (started before the merge) did not pick up the new `app/(app)/clients/@modal` slot and `layout.tsx`. Restart that dev server (`kill` its pid, then `AGENT_DEV_TOOLS=1 npx next dev -p 3105`) and retest. If it still 404s, check the intercepted route `app/(app)/clients/@modal/(.)[id]/page.tsx`. Killing the server was blocked by the permission classifier in this session, so ask Daan or do it in a session where that is allowed.

### 3. Final checks still to run

- `npx next build` on main (catches route and server-component errors the dev server misses).
- Browser pass over every screen at 1440, 1280 and 1024: Trips (board, list), Clients (list, new, profile), My places, New trip, trip workspace (itinerary, map, share review, shared popover, traveler view, expand), nav drawer with chats, `/s/<token>` at 390 wide.
- An end-to-end run: create a trip, send a brief, see a search row fill in, add a recommended place to a slot, share, open the link.
- Copy audit: `grep -rn "Qloo" app components` and `grep -rn "—" app components lib` must return nothing.
- Duplicate tokens to tidy later: `--color-amber-wash`, `--color-sand` and `--color-why` are all `#f5e6cc`; `--color-sand-ring`, `--color-ochre` and `--color-amber-dot` are all `#c98a2e`.

## Builder notes worth knowing

- **Stale caches:** fresh worktrees need `next-env.d.ts` and `design/images` copied from the main checkout before typecheck passes. A stale `.next/dev` cache can hide new CSS tokens; delete it.
- **Agent Neon branches:**
  - Test users and seeded data live on the `agent-*` Neon branches, not on main.
  - The trips builder edited two rows on `agent-ui2` by title, which also changed the new-trip builder's test data there. Main is unaffected.
- **Product calls left to Daan:**
  - Slot counts use 6 slots a day ("3 of 30 slots filled"); the design said 12.
  - Client search results are labelled "Places", not "From Google Maps", because they come from the recommendation search.
  - "Guides and transfers" on My places is left out (no such places in the data model).
  - The calendar and stepper in the New trip panel differ slightly from the design (shared `components/ui` pieces).
- **Memory:** project notes for this run are in `~/.claude/projects/-Users-daanferdinandusse-qloo/memory/tastebrief-v3-build.md`.
