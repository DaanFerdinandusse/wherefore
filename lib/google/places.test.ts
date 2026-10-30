import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import fullFixture from "./__fixtures__/place-details-full.json";
import { GoogleApiError, GoogleInputError, GoogleNotConfiguredError, GooglePhotoTooLargeError } from "./errors";
import { googleErrorResponse } from "./http";
import { MAX_PHOTO_BYTES, cardPhotoWidth, fetchPhoto, fullPhotoWidth, isPhotoName, limitBytes, photoPlaceId, photoProxyUrl, tilePhotoWidth } from "./photos";
import { createPlaceDetails, fieldMask, priceRangeOf } from "./places";

const PLACE_ID = "ChIJh32rQULLHg0RkgF8wCakjIk";
const PHOTO = fullFixture.photos[0].name;

function fakeFetch(respond: () => Response) {
  return vi.fn<typeof globalThis.fetch>(async () => respond());
}

describe("without a server key", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_PLACES_SERVER_KEY", ""));
  afterEach(() => vi.unstubAllEnvs());

  it("throws GoogleNotConfiguredError for details and photos, before any request", async () => {
    const fetch = fakeFetch(() => Response.json(fullFixture));
    const details = createPlaceDetails({ fetch: fetch });
    await expect(details(PLACE_ID, "basic")).rejects.toBeInstanceOf(GoogleNotConfiguredError);
    await expect(fetchPhoto(PHOTO, 800, { fetch: fetch })).rejects.toBeInstanceOf(
      GoogleNotConfiguredError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps to a 503 that names the fix", async () => {
    const response = googleErrorResponse(new GoogleNotConfiguredError());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "google_not_configured" });
  });
});

describe("placeDetails", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_PLACES_SERVER_KEY", "server-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("uses the tier's field mask and the key header", async () => {
    const fetch = fakeFetch(() => Response.json(fullFixture));
    const details = createPlaceDetails({ fetch: fetch });
    await details(PLACE_ID, "basic");
    const [url, init] = fetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe(`https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=en`);
    expect(headers.get("X-Goog-Api-Key")).toBe("server-key");
    expect(headers.get("X-Goog-FieldMask")).toBe(fieldMask("basic"));
    expect(fieldMask("basic")).toContain("photos");
    expect(fieldMask("basic").split(",")).toContain("googleMapsLinks");
    expect(fieldMask("basic").split(",")).toContain("utcOffsetMinutes");
    expect(fieldMask("basic")).not.toContain("reviews");
    expect(fieldMask("basic")).not.toContain("OpeningHours");
    for (const field of ["rating", "userRatingCount", "currentOpeningHours", "regularOpeningHours", "websiteUri", "nationalPhoneNumber", "priceLevel", "reviews", "editorialSummary"]) {
      expect(fieldMask("full").split(",")).toContain(field);
    }
  });

  it("normalizes the full tier and passes attributions through", async () => {
    const fetch = fakeFetch(() => Response.json(fullFixture));
    const details = createPlaceDetails({ fetch: fetch });
    const place = await details(PLACE_ID, "full");
    expect(place).toMatchObject({
      tier: "full",
      placeId: PLACE_ID,
      name: "Feitoria",
      location: { lat: 38.6934397, lon: -9.2104978 },
      rating: 4.7,
      ratingCount: 812,
      priceLevel: 4,
      phone: "21 040 0208",
      editorialSummary: "Refined Portuguese tasting menus by the river.",
      openNow: false,
    });
    expect(place.openingHours).toHaveLength(7);
    expect(place.photos[0]).toMatchObject({
      name: PHOTO,
      url: photoProxyUrl(PHOTO, 1333),
      cardUrl: photoProxyUrl(PHOTO, 760),
      fullUrl: photoProxyUrl(PHOTO, 2400),
      attributions: [{ displayName: "A Visitor", uri: "https://maps.google.com/maps/contrib/100000000000000000001" }],
    });
    expect(place.reviews?.[0]).toMatchObject({
      rating: 5,
      relativeTime: "2 months ago",
      author: { displayName: "Some Reviewer" },
    });
  });

  it("takes open now from currentOpeningHours and the weekly table from regularOpeningHours", async () => {
    const current = {
      openNow: true,
      weekdayDescriptions: ["Monday: 6:00 to 10:00 PM (holiday)"],
    };
    const withCurrent = { ...fullFixture, currentOpeningHours: current };
    const place = await createPlaceDetails({ fetch: fakeFetch(() => Response.json(withCurrent)) })(PLACE_ID, "full");
    expect(place.openNow).toBe(true);
    expect(place.openingHours).toEqual(fullFixture.regularOpeningHours.weekdayDescriptions);

    // Without regular hours, the current week's table still shows.
    const onlyCurrent = { ...fullFixture, regularOpeningHours: undefined, currentOpeningHours: current };
    const fallback = await createPlaceDetails({ fetch: fakeFetch(() => Response.json(onlyCurrent)) })(PLACE_ID, "full");
    expect(fallback.openNow).toBe(true);
    expect(fallback.openingHours).toEqual(current.weekdayDescriptions);
  });

  it("shares one request between concurrent misses for the same place", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await gate;
      return Response.json(fullFixture);
    });
    const details = createPlaceDetails({ fetch: fetch });
    const all = Promise.all([details(PLACE_ID, "full"), details(PLACE_ID, "full"), details(PLACE_ID, "basic")]);
    release();
    const [a, b, c] = await all;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(c.name).toBe("Feitoria");
    // Once settled, the next miss goes upstream again.
    details.clearCache();
    await details(PLACE_ID, "full");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("leaves full-tier fields out of a basic answer", async () => {
    const fetch = fakeFetch(() => Response.json(fullFixture));
    const place = await createPlaceDetails({ fetch: fetch })(PLACE_ID, "basic");
    expect(place.tier).toBe("basic");
    expect(place).not.toHaveProperty("reviews");
    expect(place).not.toHaveProperty("rating");
  });

  it("caches for 10 minutes by place and tier, and a full answer covers basic", async () => {
    let now = 0;
    const fetch = fakeFetch(() => Response.json(fullFixture));
    const details = createPlaceDetails({ fetch: fetch, now: () => now });
    await details(PLACE_ID, "full");
    await details(PLACE_ID, "full");
    await details(PLACE_ID, "basic");
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 10 * 60 * 1000 + 1;
    await details(PLACE_ID, "full");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refuses a malformed place id and surfaces Google errors", async () => {
    const fetch = fakeFetch(() => new Response('{"error":{"status":"NOT_FOUND"}}', { status: 404 }));
    const details = createPlaceDetails({ fetch: fetch });
    await expect(details("../../etc", "basic")).rejects.toBeInstanceOf(GoogleInputError);
    const error = await details(PLACE_ID, "basic").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleApiError);
    expect(googleErrorResponse(error).status).toBe(404);
  });
});

describe("photos", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_PLACES_SERVER_KEY", "server-key"));
  afterEach(() => vi.unstubAllEnvs());

  it("builds the proxy URL with an encoded name and a clamped width", () => {
    expect(photoProxyUrl(PHOTO, 640)).toBe(`/api/places/photo?name=${encodeURIComponent(PHOTO)}&w=640`);
    expect(photoProxyUrl(PHOTO, 99999)).toMatch(/&w=2400$/);
  });

  it("gives a tile photo its short side, so a landscape photo fills a tall frame", () => {
    expect(tilePhotoWidth({ widthPx: 4624, heightPx: 2608 })).toBe(1773);
    expect(tilePhotoWidth({ widthPx: 3024, heightPx: 4032 })).toBe(1000);
  });

  it("sizes a card photo to cover its tile, a fraction of the arch's width", () => {
    expect(cardPhotoWidth({ widthPx: 4000, heightPx: 3000 })).toBe(760);
    expect(cardPhotoWidth({ widthPx: 3024, heightPx: 4032 })).toBe(760);
    expect(cardPhotoWidth({ widthPx: 4000, heightPx: 1000 })).toBe(2000);
    expect(cardPhotoWidth({ widthPx: 600, heightPx: 400 })).toBe(600);
    expect(cardPhotoWidth({})).toBe(760);
  });

  it("gives a viewer photo its long side", () => {
    expect(fullPhotoWidth({ widthPx: 4624, heightPx: 2608 })).toBe(2400);
    expect(fullPhotoWidth({ widthPx: 3024, heightPx: 4032 })).toBe(1800);
  });

  it("never sizes a photo above its original, so both sizes can share one request", () => {
    expect(tilePhotoWidth({ widthPx: 800, heightPx: 600 })).toBe(800);
    expect(fullPhotoWidth({ widthPx: 800, heightPx: 600 })).toBe(800);
  });

  it("falls back to a fixed width when Google sends no size", () => {
    expect(tilePhotoWidth({})).toBe(800);
    expect(fullPhotoWidth({})).toBe(2400);
  });

  it("accepts only Google photo names", () => {
    expect(isPhotoName(PHOTO)).toBe(true);
    expect(isPhotoName("places/abc/../../secrets")).toBe(false);
    expect(isPhotoName("https://evil.test/x")).toBe(false);
  });

  it("reads the place a photo belongs to from a valid name only", () => {
    expect(photoPlaceId(PHOTO)).toBe(PLACE_ID);
    expect(photoPlaceId("places/abc/../../secrets")).toBeNull();
    expect(photoPlaceId("")).toBeNull();
  });

  it("fetches the media endpoint and streams the bytes", async () => {
    const fetch = fakeFetch(() => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    const photo = await fetchPhoto(PHOTO, 640, { fetch: fetch });
    expect(String(fetch.mock.calls[0][0])).toBe(`https://places.googleapis.com/v1/${PHOTO}/media?maxWidthPx=640`);
    expect(photo.contentType).toBe("image/jpeg");
    expect(photo.body).toBeInstanceOf(ReadableStream);
    expect((await new Response(photo.body).arrayBuffer()).byteLength).toBe(3);
  });

  it("never asks Google for more than 2400 px", async () => {
    const fetch = fakeFetch(() => new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }));
    await fetchPhoto(PHOTO, 4800, { fetch: fetch });
    expect(String(fetch.mock.calls[0][0])).toMatch(/maxWidthPx=2400$/);
  });

  it("refuses a declared body over 4 MB before reading it", async () => {
    const fetch = fakeFetch(
      () =>
        new Response(new Uint8Array([1]), {
          headers: { "content-type": "image/jpeg", "content-length": String(MAX_PHOTO_BYTES + 1) },
        }),
    );
    const error = await fetchPhoto(PHOTO, 800, { fetch: fetch }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GooglePhotoTooLargeError);
    expect(googleErrorResponse(error).status).toBe(502);
  });

  it("errors the stream once an undeclared body passes 4 MB", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 5; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const fetch = fakeFetch(() => new Response(upstream, { headers: { "content-type": "image/jpeg" } }));
    const photo = await fetchPhoto(PHOTO, 800, { fetch: fetch });
    await expect(new Response(photo.body).arrayBuffer()).rejects.toBeInstanceOf(GooglePhotoTooLargeError);
  });

  it("reads Google's price range as whole units, or nothing without a currency", () => {
    expect(priceRangeOf({ startPrice: { currencyCode: "EUR", units: "20" }, endPrice: { currencyCode: "EUR", units: "30" } })).toEqual({
      currency: "EUR",
      start: 20,
      end: 30,
    });
    expect(priceRangeOf({ startPrice: { units: "20" } })).toBeUndefined();
    expect(priceRangeOf(undefined)).toBeUndefined();
  });

  it("passes a body under the cap through unchanged", async () => {
    const bytes = new Uint8Array(MAX_PHOTO_BYTES).fill(7);
    const out = new Response(new Response(bytes).body!.pipeThrough(limitBytes(MAX_PHOTO_BYTES)));
    expect((await out.arrayBuffer()).byteLength).toBe(MAX_PHOTO_BYTES);
  });
});
