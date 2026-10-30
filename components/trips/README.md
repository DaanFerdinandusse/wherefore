# components/trips

The Trips page (Paper v3 "H1 Trips board") at `/trips` (`app/(app)/trips/(overview)`): the panel header has the Board / List toggle (`?view=list`) and New trip; the body has the "Trips" title with counts, the "Needs you" row and either four stage columns or one sortable table. Everything shown comes from `listTrips`; nothing is computed by a model.

- `columns.ts`: the stage columns, their limits and the optimistic move. Tested.
- `status.ts`: the one status line per trip ("3 of 30 slots filled", "16 places ready", "Opened yesterday", "Not opened in 4 days", "Day 2 of 5, tonight open", "Needs Jonas's favorites"). "Not opened" is only said about links whose opens are recorded (`shareOpensTracked`). Tested.
- `nudges.ts`: the "Needs you" cards (link not opened for 2+ days, search done with places to review, traveler with tonight open, departure within a week with empty days), the "Draft a nudge" message and the summary line. Tested.
- `sort.ts`: the List view's order (stage, dates, city, client). Tested.
- `format.ts`: date and name labels, shared with the nav drawer and the New trip panel. Tested.
- `trips-board.tsx`, `trips-list.tsx`, `trip-card.tsx` (big card, dashed card, done row), `trip-actions-menu.tsx` (Open, Move to, Reset), `use-trip-moves.ts` (drag and menu moves save `setStageOverride` through `moveTripToStage`), `needs-you.tsx`, `trips-view-toggle.tsx`, `trips-skeleton.tsx`, `trips-empty.tsx`, `icons.tsx`.

Share opens: `app/s/[token]/load.ts` calls `noteShareOpen` (`lib/trips/share-open.ts`), which skips link previews and prefetches (`share-open-rules.ts`) and writes `recordShareOpen` after the response; the trip's own advisor is skipped in SQL.
