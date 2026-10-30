# components/trip/map

The Discover map (Paper 02b, F8, F7b). `TripMap` (`trip-map.tsx`, default export too) takes `TripMapProps` from `components/trip/contracts.ts` and nothing else; every interaction goes out through a callback.

| File | What it does |
|---|---|
| trip-map.tsx | Composition: APIProvider, status (loading, ready, unavailable), camera state, fitting, highlight pan, selection reveal, overlays |
| google-surface.tsx | The live map: vector, cloud style through the map id, greedy gestures, no default UI, pins as AdvancedMarkers with our HTML |
| static-surface.tsx | The same pins over a warm hairline grid, same Web Mercator scale; drag pans. Shown while the live map loads and when it cannot |
| pins.tsx | PinView (photo, numbered, score dot), PinLabel, PlaceholderPin |
| preview-card.tsx | The card for the selected pin; "Open profile" calls `onOpenProfile` |
| controls.tsx | ZoomControls, SearchAreaButton, OffscreenChip, MapUnavailableNotice |
| surface.ts | The engine both surfaces implement (fit, panTo, moveTo, zoomBy) and move causes |
| trip-map-panel.tsx | The trip panel's map (G2): day tabs, search tabs, `TripMap` with `pinStyle="itinerary"` and no preview card, the bar at the bottom |
| search-tabs.tsx | The row under the day tabs: one chat search (the one on the map, else the newest), "6 more" for the full list with photos |
| map-panel-model.ts | Pure: day tabs, the searches the map can show, which places get a pin per day or search, what the bar says about a place |
| map-error-boundary.tsx | Falls back to the plain background if the map script throws |

Pure rules live in `lib/map` with tests: `fitBoundsFor`, `cameraForBounds`, `radiusFromViewport`, `movedFar`, `offscreenDirection` (geo.ts), `declutter` (declutter.ts), `buildPins` and the size table (pins.ts), `pinLabel`, `becauseLine`, `typeLine` (label.ts), `mapRegionPrompt` (region-prompt.ts).

Extra props beyond the contract (on `TripMapComponentProps`): `surface` ("auto" or "static"), `insets` (edges covered by workspace chrome), `pinStyle` ("discover" or "itinerary": photo pins with a day badge and name, `ItineraryPinView`), `preview` (the selected pin's preview card, off in the trip panel), `fitScope` (changing it fits the map again), `centerSelection` (the selected place moves to the middle of the free area), `onPinDoubleClick` and `landedPlaceId`.

Pins on the trip panel's map: one click picks a place (the bar changes, the map centers on it), a double click also opens its modal. The bar says "On Day 2 lunch" for a place in the itinerary and offers Add for one that is not: the slot its search was for, the slot the chat suggested it for, else the next free slot that suits it. Open is always there. Centering waits a moment, so a double click does not lose its pin. Adding plays one landing (`LANDING_MS`): the button says Added and folds away, the bar warms and names the day, and the pin (`landedPlaceId`) gets its badge with a ring. A failed save undoes it.

Searches on the trip panel's map: one tab is on across both rows, a day or a search. The row shows the search that is on, else the newest; the full list runs morning to night, then searches with no time, each with an icon for its time or its kind of place. A search is the store's `activeTab`, so a new search opens by itself and the URL keeps it. Its places are the photo pins with their match score and the map fits to them; the itinerary shrinks to day numbers. The dev page is `/map-lab/panel`.

Search this region: only with a finished search's results on the map, never on a day tab (the panel passes `onSearchArea` only then). `TripMap` remembers where a fit or a search left the view and measures the advisor's moves from there (`movedFar` in `lib/map/geo.ts`: a pan of 40% of the shorter side, or a zoom of one level). The button shows only while the view is that far away, so coming back hides it, and moves the app makes (fits, pans to a pin) never count. Pressing it sends the chat a prompt through the store (`askChat`) for the same thing as the search on the map ("lunch on day 2", `regionAsk`), with the circle on screen as a marker line (`lib/map/region-prompt.ts`). The chat bubble and the title leave the marker out; the agent copies it into `find_places` as `near`. A prompt sent during a reply waits for the reply to end. While a new search has no places yet, the map stays where it is.

Map availability: the live map counts as ready only when its tiles load and its own `.gm-style` layer exists. A rejected key or a disabled API is detected by `gm_authFailure`, the map's error box, a map without its DOM after 3 s, or no tiles after 10 s; the pins stay on the plain background with "Map is not available yet". The dev page is `/map-lab`.
