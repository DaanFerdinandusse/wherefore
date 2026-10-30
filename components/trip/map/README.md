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
| trip-map-panel.tsx | The trip panel's map (G2): day chips, `TripMap` with `pinStyle="itinerary"` and no preview card, the "Suggested for Day 2 lunch" card |
| map-panel-model.ts | Pure: day chips, which places get a pin per day filter, the suggestion the card offers |
| map-error-boundary.tsx | Falls back to the plain background if the map script throws |

Pure rules live in `lib/map` with tests: `fitBoundsFor`, `cameraForBounds`, `radiusFromViewport`, `offscreenDirection` (geo.ts), `declutter` (declutter.ts), `buildPins` and the size table (pins.ts), `pinLabel`, `becauseLine`, `typeLine` (label.ts).

Extra props beyond the contract (on `TripMapComponentProps`): `surface` ("auto" or "static"), `insets` (edges covered by workspace chrome), `pinStyle` ("discover" or "itinerary": photo pins with a day badge and name, `ItineraryPinView`) and `preview` (the selected pin's preview card, off in the trip panel).

Map availability: the live map counts as ready only when its tiles load and its own `.gm-style` layer exists. A rejected key or a disabled API is detected by `gm_authFailure`, the map's error box, a map without its DOM after 3 s, or no tiles after 10 s; the pins stay on the plain background with "Map is not available yet". The dev page is `/map-lab`.
