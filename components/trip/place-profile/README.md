# components/trip/place-profile

The place profile sheet (Paper 03 and 03b). `PlaceProfile` takes `PlaceProfileProps` from `components/trip/contracts.ts` plus one optional `initialProfile` (a `TripPlaceProfile` loaded on the server, skips the first fetch).

| File | What it holds |
|---|---|
| `place-profile.tsx` | The sheet: photos left, the scroll column right (header, why, your pick, about, hours and contact, reviews), actions pinned below, compact header once the title scrolls out. |
| `place-card-parts.tsx` | The photo strip, chips and tabs the place card and the favorite card share. |
| `favorite-place.tsx` | A favorite opened from "Why Ana" or the itinerary's "Fans of": photos, About, Visit info and Reviews, no actions, over the card that named it. Artists and films stay plain names. Data: `GET /api/places/by-entity/<entityId>`. |
| `place-photos.ts` | `placePhotos`, used by the card and the sheet: Google's photos alone once loaded, the provider's until then or when Google has none. Tested in `place-photos.test.ts`. |
| `photo-viewer.tsx` | Modal for the selected card photo, full-image view at up to 2400 px without the film grade, thumbnail strip, keyboard navigation and focus return. |
| `profile-photos.tsx` | Arch photo, two small photos, "See all N photos" strip; Google photos carry "From Google" and the author. |
| `maps-photos-link.tsx` | "See all on Google Maps": Google's API returns 10 photos at most, so the viewer, the strip and the card's More photos link to the full gallery. |
| `profile-why.tsx` | Score, the "People who love ..." sentence, driver bars (width = share; "Other favorites" never shown as a favorite), shared taste tags. |
| `profile-your-pick.tsx` | The advisor's note, saved date, trips used, Edit note in place. |
| `slot-picker.tsx` | "Day 2 · Lunch" popover; default is the next free slot that suits the category. |
| `profile-details.tsx` | Hours (trip days bold) and Contact, Reviews from Google. |
| `profile-format.ts` | Pure helpers, tested in `profile-format.test.ts`. |
| `use-profile-data.ts` | `GET /api/trip-places/<id>` on open; Google `basic` on open and `full` when Hours scrolls into view, via `/api/places/<placeId>/google?tier=`. |

Data: `lib/trips/profile-types.ts` (response type and pure builder), `lib/trips/profile-query.ts` (loader), `app/api/trip-places/[tripPlaceId]/route.ts`. Server actions for the workspace: `lib/trips/profile-actions.ts`. Replacement on "Not for Ana": `lib/trips/replace.ts`. Dev page: `/profile-lab`.

Nothing from Google is stored. Without a Google key or listing the sheet shows the provider data only (provider hours, website, phone), with no error.

`place-card.tsx` is the chat recommendation and overlay card. Its name and detail tabs precede the photo strip. Open more photos reveals the photos after the first three in a grid below the strip, which stays fixed above it. Collapse photos under the grid closes it again and returns focus to the tile that opened it. The grid stays mounted so it can fade and fold both ways; opening or closing it pauses chat following through `data-photo-toggle`, and reduced motion switches the reveal instantly. The reveal styles live in `app/globals.css`. Visit info and Reviews open at full size: while Google answers, their sections stand with shimmering lines (`skeleton-shimmer`) in the rows, and facts already known, like the address, show right away.
