# components/trip/place-profile

The place profile sheet (Paper 03 and 03b). `PlaceProfile` takes `PlaceProfileProps` from `components/trip/contracts.ts` plus one optional `initialProfile` (a `TripPlaceProfile` loaded on the server, skips the first fetch).

| File | What it holds |
|---|---|
| `place-profile.tsx` | The sheet: photos left, the scroll column right (header, why, your pick, about, hours and contact, reviews), actions pinned below, compact header once the title scrolls out. |
| `photo-viewer.tsx` | Modal for the selected card photo, full-image view, thumbnail strip, keyboard navigation and focus return. |
| `profile-photos.tsx` | Arch photo, two small photos, "See all N photos" strip; Google photos carry "From Google" and the author. |
| `profile-why.tsx` | Score, the "People who love ..." sentence, driver bars (width = share; "Other favorites" never shown as a favorite), shared taste tags. |
| `profile-your-pick.tsx` | The advisor's note, saved date, trips used, Edit note in place. |
| `slot-picker.tsx` | "Day 2 · Lunch" popover; default is the next free slot that suits the category. |
| `profile-details.tsx` | Hours (trip days bold) and Contact, Reviews from Google. |
| `profile-format.ts` | Pure helpers, tested in `profile-format.test.ts`. |
| `use-profile-data.ts` | `GET /api/trip-places/<id>` on open; Google `basic` on open and `full` when Hours scrolls into view, via `/api/places/<placeId>/google?tier=`. |

Data: `lib/trips/profile-types.ts` (response type and pure builder), `lib/trips/profile-query.ts` (loader), `app/api/trip-places/[tripPlaceId]/route.ts`. Server actions for the workspace: `lib/trips/profile-actions.ts`. Replacement on "Not for Ana": `lib/trips/replace.ts`. Dev page: `/profile-lab`.

Nothing from Google is stored. Without a Google key or listing the sheet shows the provider data only (provider hours, website, phone), with no error.

`place-card.tsx` is the chat recommendation and overlay card. Its name and detail tabs precede the photo strip. More photos reveals only photos after the first three, with two additional rows visible and scrolling contained to that grid. The original strip stays fixed above it. Opening or closing photos pauses chat following; reduced motion switches the reveal instantly. Gallery styles live in `app/globals.css`.
