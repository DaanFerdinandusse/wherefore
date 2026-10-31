# components/trip/place-profile

The place card and the favorite card, with the photos, formatting and data they share.

| File | What it holds |
|---|---|
| `place-card-parts.tsx` | The photo strip, chips and tabs the place card and the favorite card share. |
| `favorite-place.tsx` | A favorite opened from "Why Ana" or the itinerary's "Fans of": photos, About, Visit info and Reviews, no actions, over the card that named it. Artists and films stay plain names. Data: `GET /api/places/by-entity/<entityId>`. |
| `place-photos.ts` | `placePhotos`, used by the place card and the favorite card: Google's photos alone once loaded, the provider's until then or when Google has none. Tested in `place-photos.test.ts`. |
| `photo-viewer.tsx` | Modal for the selected card photo, full-image view at up to 2400 px without the film grade, thumbnail strip, keyboard navigation and focus return. |
| `maps-photos-link.tsx` | "See all on Google Maps": Google's API returns 10 photos at most, so the viewer and the card's More photos link to the full gallery. |
| `slot-picker.tsx` | "Day 2 · Lunch" popover; default is the next free slot that suits the category. |
| `profile-format.ts` | Pure helpers, tested in `profile-format.test.ts`. |
| `use-profile-data.ts` | `GET /api/trip-places/<id>` on open; Google `basic` on open and `full` when Hours scrolls into view, via `/api/places/<placeId>/google?tier=`. |

Data: `lib/trips/profile-types.ts` (response type and pure builder), `lib/trips/profile-query.ts` (loader), `app/api/trip-places/[tripPlaceId]/route.ts`. Server actions for the workspace: `lib/trips/profile-actions.ts`. Replacement on "Not for Ana": `lib/trips/replace.ts`.

Nothing from Google is stored. Without a Google key or listing the card shows the provider data only (provider hours, website, phone), with no error.

`place-card.tsx` is the chat recommendation and overlay card. Its name and detail tabs precede the photo strip. Open more photos reveals the photos after the first three in a grid below the strip, which stays fixed above it. Collapse photos under the grid closes it again and returns focus to the tile that opened it. The grid stays mounted so it can fade and fold both ways; opening or closing it pauses chat following through `data-photo-toggle`, and reduced motion switches the reveal instantly. The reveal styles live in `app/globals.css`. Visit info and Reviews open at full size: while Google answers, their sections stand with shimmering lines (`skeleton-shimmer`) in the rows, and facts already known, like the address, show right away.
