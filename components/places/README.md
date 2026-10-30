# components/places: My places (H4, H5)

The `/places` screen: the advisor's own places one city at a time, with private notes, scored for a client. The page (`app/(app)/places/page.tsx`) is a server component that reads `?city=`, `?category=`, `?client=` (`none` turns scoring off) and `?list=team`, and renders these client islands inside `AppPage`.

| File | What it holds |
|---|---|
| `city.ts` | Pure rules: category tabs and sections ("Hotels", "Restaurants and bars", four per section on All with "All 6 hotels"), city tiles (count, country, photo, "6 hotels, 12 to eat", the trip fact), the default client and the picker's trip line. Tested in `city.test.ts`. |
| `format.ts` | Pure card helpers: type label, note cleaning and quoting, "In N trips", "Last for Ana Ruiz" or the saved date, `cityCenter`, `placesHref`. Tested in `format.test.ts`. |
| `city-switcher.tsx` | The "Where" control in the panel header and its dropdown (H5): city tiles with "Showing now", search with Esc, and unknown names looked up as localities ("Open Porto"). |
| `category-tabs.tsx` | All / Hotels / Restaurants / ... with counts, as links (server component). |
| `client-picker.tsx` | "Scored for Ana Ruiz": clients with a trip to the city first, then everyone; "Do not score". |
| `scores.tsx` | The scoring promise in context; `ScorePill` ("94 for Ana") and `ScoreStatus` read it, so cards render before the scores stream in. |
| `city-places.tsx` | The sections and their cards. Remove hides the card, deletes, and offers Undo. |
| `place-card.tsx` | One card: film photo with the saved bookmark (removes), type and neighborhood, Bodoni name, score pill, italic note (click to edit), use line. |
| `note-editor.tsx` | Inline note editor (Cmd or Ctrl + Enter saves, Escape cancels). Reusable for the profile's "Your pick". |
| `save-place.tsx` | "Save a place": search (`/api/entities/search`, biased to the city in view), "Already in your places" (`/api/advisor-places`), then note and city (the city in view by default). |
| `taste.tsx` | Mine / Team (only with an organization) and "Your taste": the taste tags with Refresh and the "Blend my taste into searches" switch, in a header popover. |
| `places-provider.tsx` | The one toast (with Undo) and the taste tags. `tasteChanged()` recomputes the portrait 2.5 s after the last save or removal. |

Server side: `lib/places/queries.ts` (`listAdvisorPlaces` with category, country and last client; `listCityTrips`), `lib/places/scores.ts` (`scorePlacesForClient`: the agent's signal rules for one client, one scoring call, answers cached a day in `api_cache`), `lib/places/actions.ts` (server actions, each starts with `requireUser()`), `lib/places/taste.ts` (advisor taste portrait).

Not built: the design's "Guides and transfers" rows. Saved places are always provider places (restaurants, bars, hotels, sights), so the data model has no guides or transfer companies to list.
