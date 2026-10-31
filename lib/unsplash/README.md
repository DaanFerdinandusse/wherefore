# lib/unsplash

The trip cover: the first landscape Unsplash photo for the destination's name, picked once when the trip is created and stored on `trips.cover`. Set `UNSPLASH_ACCESS_KEY` to turn it on. Without the key, or when a lookup fails, the trip keeps its place photo.

- `map.ts`: pure. Parses a search response into a `TripCover` and the download endpoint.
- `search.ts`: server only. `findCoverPhoto(destination)` searches, `markCoverPhotoUsed(location)` pings the download endpoint.

Unsplash's API terms, and where each one is met:

- Hotlink the photo: `trips.cover.url` stays on `images.unsplash.com`. `unsplashLoader` in `lib/images/source.ts` asks that host for the size the page needs.
- Credit the photographer and Unsplash, with utm params: `components/ui/cover-credit.tsx`, on the itinerary cover and the traveler hero.
- Ping the download endpoint when a photo is used: `POST /api/trips` and the demo seed call `markCoverPhotoUsed`.

The demo key allows 50 requests an hour.
