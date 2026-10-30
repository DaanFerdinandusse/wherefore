# components/new-trip

The New trip panel (Paper v3 "N1" to "N4"). `NewTripLauncher` sits in the (app) layout and opens `NewTripPanel` over any page when the URL has `?new=1`; `?client=<id>` prefills For who and `?where=<name>` starts the destination search. Closing removes the three params with a history replace.

The panel is a rounded sheet anchored to the top over the dimmed page: the Bodoni title, Close, and the bar For who | Where | When | Travelers | Create trip. The open segment is a white pill with an ink outline; its dropdown hangs under the sheet (`Drop` in `new-trip-panel.tsx`). Create trip is muted until who and where are set; then a line under the bar says the trip opens with a chat. Creating does not start a search: the trip page opens and the agent searches once the advisor asks.

- `draft.ts`: the pure draft reducer, segment summaries and `toCreateTripRequest`. Tested.
- `request.ts`: the Zod body of `POST /api/trips`, shared with the route.
- `localities.ts`: candidate ordering (city before a same-named state), the "N of your places" count, the stored Destination. Tested.
- `format.ts`: copy for client rows, traveler rows, city cards and the create line. Every part comes from a stored fact; a missing one is left out. Tested.
- `drop-keys.ts`: arrow keys between `data-row` rows in a dropdown.
- `new-trip-panel.tsx`: the sheet, bar, dropdown host and Create trip. One dropdown at a time; Escape closes the dropdown (focus back on its segment), then the panel. A press on the scrim closes the dropdown first, then the panel.
- `bar-segment.tsx`: a segment button and the dropdown section label.
- `who-menu.tsx` (N1): recent clients with three favorite photos and "home city · next trip", "Find a client by name or city" in place, "+ New client".
- `where-menu.tsx` (N2): "Search a city", then city cards: where the advisor has the most places, and where the client went before. The photo is one of the advisor's places in that city.
- `when-menu.tsx` (N3): the two-month calendar from `components/ui`.
- `travelers-menu.tsx` (N4): the client with the Client tag and whose favorites drive the search, companions (one of your clients, or a guest by name only, no favorites of their own), Adults and Children.

Server actions live in `lib/trips/actions.ts` (context with city photos, client search, past destinations). "New client" links to `/clients/new?return=<current url>`; the client screen should append `client=<new id>` to that url so the panel reopens with the new client.
