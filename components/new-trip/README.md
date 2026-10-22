# components/new-trip

The New trip panel (Paper F1 to F4 and D). `NewTripLauncher` sits in the (app) layout and opens `NewTripPanel` over any page when the URL has `?new=1`; `?client=<id>` prefills For who and `?where=<name>` starts the destination search. Closing removes the three params with a history replace.

- `draft.ts`: the pure draft reducer, segment summaries and `toCreateTripRequest`. Tested.
- `request.ts`: the Zod body of `POST /api/trips`, shared with the route.
- `localities.ts`: candidate ordering (city before a same-named state), the "N of your places" count, the stored Destination. Tested.
- `format.ts`: copy for client, traveler and suggestion rows. Tested.
- `new-trip-panel.tsx`: the panel, bar and Create trip. One menu open at a time; Escape closes the menu, then the panel.
- `who-menu.tsx`, `where-menu.tsx`, `when-menu.tsx`, `travelers-menu.tsx`: one per segment.

Server actions live in `lib/trips/actions.ts` (context, client search, past destinations, guest clients). "New client" links to `/clients/new?return=<current url>`; the client screen should append `client=<new id>` to that url so the panel reopens with the new client.
