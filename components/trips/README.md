# components/trips

The Trips overview (Paper A) at `/trips` (`app/(app)/trips/(overview)`): four stage columns from `listTrips`, trip cards, drag between columns (and "Move to ..." in the card menu) saving `setStageOverride` through `moveTripToStage`, and a dock of plain nudges.

- `columns.ts`: the stage columns and the optimistic move. Tested.
- `format.ts`: date ranges, nights, card status lines. Tested.
- `nudges.ts`: the dock sentence and the page summary, computed from the trips rows (no model call). Tested.
- `trips-board.tsx`, `trip-card.tsx`: the board (client), `trips-dock.tsx`, `trips-header.tsx`, `trips-skeleton.tsx`.
