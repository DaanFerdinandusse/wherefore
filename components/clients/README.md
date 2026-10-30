# components/clients

The Clients section (Paper v3: H3 Clients, C1 New client, C2 Client profile).

- `list/`: H3. `clients-screen.tsx` (server) reads `?q=`, `?show=` (all, upcoming, none) and `?all=1`; `client-card.tsx` is one profile card; `clients-filters.tsx` is the panel header switch.
- `modal/client-modal.tsx`: the centered sheet for C1 and C2. Opened from the list it is an intercepted route (`app/(app)/clients/@modal/(.)new`, `(.)[id]`) and closing goes Back; a deep link (`/clients/new`, `/clients/<id>`) renders the list plus the sheet and closing goes to `/clients`.
- `new/`: C1. Name, home city (locality search), optional email, places picked from the recommendation search; saved together by `createClientWithFavoritesAction`. `?return=<url>` (the New trip panel) gets `client=<id>` on save. `return-to.ts` is tested.
- `profile/`: C2, saved as you type. `use-client-taste.ts` holds favorites, artists and films, taste tags and rules; `mosaic.ts` lays out the photo grid (tested); `search-groups.ts` orders the place, artist and film results (tested).
- `format.ts`, `favorites.ts`, `localities.ts`, `autosave.ts`: pure helpers, tested.
