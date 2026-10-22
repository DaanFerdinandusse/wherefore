# components/places: My places (E)

The `/places` screen: the advisor's own places per city, with private notes. The page (`app/(app)/places/page.tsx`) is a server component that reads `?city=`, `?q=` and `?list=team` and renders these client islands.

| File | What it holds |
|---|---|
| `format.ts` | Pure helpers: type line, note quoting and cleaning, "In N trips", "Last for", saved date, `groupByCity`, `cityCenter`, `placesHref`. Tested in `format.test.ts`. |
| `places-provider.tsx` | The one toast (with Undo) and the taste tags. `tasteChanged()` recomputes the portrait 2.5 s after the last save or removal. |
| `city-filter.tsx` | City pills bound to `?city=`, "All cities" first. |
| `places-search.tsx` | Search over name, city and note, bound to `?q=` (debounced). |
| `places-grid.tsx` | The card grid, one section per city on "All cities". Remove hides the card, deletes, and offers Undo. |
| `place-card.tsx` | One card: film photo, bookmark, type line, name, quoted note, use line, menu (edit note, remove). |
| `note-editor.tsx` | Inline note editor (Cmd or Ctrl + Enter saves, Escape cancels). Reusable for the profile's "Your pick". |
| `save-place.tsx` | "Save a place": search (`/api/entities/search`, biased to the city in view), "Already in your places" (`/api/advisor-places`), then note and city. |
| `places-rail.tsx`, `rail-controls.tsx` | Mine / Team, "Your taste" with Refresh, the blend switch, "Save from anywhere". |

Server side: `lib/places/actions.ts` (server actions, each starts with `requireUser()`), `lib/places/taste.ts` (advisor taste portrait), `takeAdvisorPlace` / `restoreAdvisorPlace` in `lib/places/mutations.ts` (remove with undo), `advisorPlacesByEntityIds` in `lib/places/queries.ts`.
