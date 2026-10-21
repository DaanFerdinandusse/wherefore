import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import fullFixture from "./__fixtures__/place-details-full.json";
import { GoogleApiError, GoogleInputError, GoogleNotConfiguredError } from "./errors";
import { googleErrorResponse } from "./http";
import { fetchPhoto, isPhotoName, photoProxyUrl } from "./photos";
import { createPlaceDetails, fieldMask } from "./places";

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
    expect(fieldMask("basic")).not.toContain("reviews");
    for (const field of ["rating", "userRatingCount", "regularOpeningHours", "websiteUri", "nationalPhoneNumber", "priceLevel", "reviews", "editorialSummary"]) {
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
      url: photoProxyUrl(PHOTO, 800),
      attributions: [{ displayName: "A Visitor", uri: "https://maps.google.com/maps/contrib/100000000000000000001" }],
    });
    expect(place.reviews?.[0]).toMatchObject({
      rating: 5,
      relativeTime: "2 months ago",
      author: { displayName: "Some Reviewer" },
    });
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
    expect(photoProxyUrl(PHOTO, 99999)).toMatch(/&w=4800$/);
  });

  it("accepts only Google photo names", () => {
    expect(isPhotoName(PHOTO)).toBe(true);
    expect(isPhotoName("places/abc/../../secrets")).toBe(false);
    expect(isPhotoName("https://evil.test/x")).toBe(false);
  });

  it("fetches the media endpoint and returns the bytes", async () => {
    const fetch = fakeFetch(() => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    const photo = await fetchPhoto(PHOTO, 640, { fetch: fetch });
    expect(String(fetch.mock.calls[0][0])).toBe(`https://places.googleapis.com/v1/${PHOTO}/media?maxWidthPx=640`);
    expect(photo.contentType).toBe("image/jpeg");
    expect(photo.body.byteLength).toBe(3);
  });
});
