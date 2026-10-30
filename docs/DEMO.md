# Demo data

`scripts/seed-demo.ts` fills one advisor's workspace with believable data. Every place is a real entity, looked up live through `lib/qloo` one request at a time (the upstream rate limits parallel bursts), so ids, photos, tags and scores are what the API returns. The data itself (names, notes, rules, dates) lives in `lib/demo/data.ts`; the match and date rules in `lib/demo/rules.ts` (tested).

## Run it

The public hackathon app uses one shared owner, with no account creation:

```sh
npx tsx --conditions=react-server scripts/seed-demo.ts --owner tastebrief-demo
```

The script reads `.env.local`. This owner needs no Neon Auth row. Existing account seeds still support `--owner-email` for maintenance, but the public app only opens `tastebrief-demo`.

## What it creates

| What | Rows |
|---|---|
| Advisor | The `advisors` row for the user (as `ensureAdvisor` writes it), display name "Daan", home city "Amsterdam", "Your taste" tags from their saved places |
| Clients | Ana Ruiz (New York), Marcus Lee (London), Sofia Haddad (Paris), Lena Okafor (Berlin), each with notes, ground rules and taste tags from their favorites |
| Favorites | Ana: Via Carota, Lilia, Attaboy, Devoción, plus Khruangbin under "Also into". Marcus: St. John, Bar Termini, Monmouth Coffee, Rochelle Canteen. Sofia: Le Châteaubriand, Clamato, Septime La Cave, Ten Belles. Lena: Nobelhart & Schmutzig, The Barn, and "Mel's", which has no match near Berlin on purpose (the no-match tile with three candidates) |
| My places | 11 in Lisboa, 6 in Ciudad de México, each with a private note. The city is the locality name the destination picker stores, so "N of your places" matches |
| Trips | One per stage, each with its chat row and travelers (`createTrip`) |

| Trip | Stage | Dates | Board |
|---|---|---|---|
| Lisbon for Ana | planning | 14 to 18 May 2027, Ana plus guest Clara (no profile) | Empty, seed pending: the agent's first turn fills it |
| Mexico City for Marcus | shared | the 12th to 16th of next month, share link set | 6 eat and 6 drink results on Marcus's favorites, his 6 saved places in the city scored as "Your place", 8 slots on days 1 and 2, seed done |
| Paris for Sofia | traveling | yesterday to 3 days from now | 6 eat and 6 drink results on Sofia's favorites, 6 slots on days 1 and 2, seed done |
| Oaxaca for Ana | done | 6 to 10 March last year | Empty, seed pending |

Dates are computed on the day you run it, so the stages hold. The two filled boards write `trip_calls` (source `seed`) for "How we got this" and a `built_from` summary. Board categories come from the category re-check, so a drink search can return a restaurant under Eat.

## How long

About 35 s on a cold cache (about 50 API calls). Every lookup also lands in `api_cache` (search 7 days, insights 24 hours), so a second run takes under 10 s.

## Running it again

Safe to run twice: clients are matched by name within the owner, favorites by query, saved places by place id, trips by title. Existing rows are kept as they are (an edited note or rename survives); the filled boards are skipped once their seed is done. The summary prints rows before and after per table, so a second run shows 0 new rows.

## Reset

```sh
npx tsx --conditions=react-server scripts/seed-demo.ts --owner tastebrief-demo --reset
```

`--reset` first deletes this owner's chats, trips (with their travelers, trip places, asks, slots and calls), saved places and clients (with their favorites), in one batch, then seeds again. The advisors row stays (its taste tags are recomputed). Other owners' rows and the shared `places` cache are never touched. Use it to move the relative dates back to today.
