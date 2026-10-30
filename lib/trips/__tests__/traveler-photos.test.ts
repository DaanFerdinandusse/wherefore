import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { GooglePhoto, GooglePlaceDetails, PlaceDetails } from "@/lib/google/contracts";

import { type SharedSlotRow, toSharedTripView } from "../share";
import { sharePhotoPath, withGooglePhotos } from "../traveler-photos";

const photo = (id: string, author?: { displayName?: string; uri?: string }): GooglePhoto => ({
  name: `places/x/photos/${id}`,
  url: `/api/places/photo?name=${id}&w=1000`,
  cardUrl: `/api/places/photo?name=${id}&w=760`,
  fullUrl: `/api/places/photo?name=${id}&w=2400`,
  attributions: author ? [author] : [],
});

const details = (photos: GooglePhoto[]): GooglePlaceDetails => ({ tier: "basic", placeId: "x", photos });

function row(name: string, googlePlaceId: string | null): SharedSlotRow {
  return {
    day: 1,
    date: null,
    slot: "lunch",
    position: 0,
    note: "",
    noteForTraveler: false,
    place: {
      name,
      category: "eat",
      imageUrl: "https://images.qloo.com/i/a-420x-auto.jpg",
      images: ["https://images.qloo.com/i/a-420x-auto.jpg"],
      neighborhood: null,
      explainability: [],
      sharedTags: [],
      reason: null,
      googlePlaceId,
    },
  };
}

const lookup = (answer: PlaceDetails) => vi.fn<PlaceDetails>(answer);

describe("withGooglePhotos", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_PLACES_SERVER_KEY", "server-key"));
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it("gives each place up to three photos with both sizes and the author", async () => {
    const found = lookup(async () =>
      details([
        photo("a", { displayName: "A Visitor", uri: "https://maps.google.com/a" }),
        photo("b", {}),
        photo("c"),
        photo("d"),
      ]),
    );
    const [slot] = await withGooglePhotos([row("Brutos", "id-1")], undefined, found);
    expect(slot?.place?.googlePhotos).toEqual([
      {
        src: "/api/places/photo?name=a&w=1000",
        fullSrc: "/api/places/photo?name=a&w=2400",
        author: "A Visitor",
        authorUri: "https://maps.google.com/a",
      },
      { src: "/api/places/photo?name=b&w=1000", fullSrc: "/api/places/photo?name=b&w=2400" },
      { src: "/api/places/photo?name=c&w=1000", fullSrc: "/api/places/photo?name=c&w=2400" },
    ]);
  });

  it("serves a shared trip's photos from its own route", async () => {
    const found = lookup(async () => details([photo("a")]));
    const path = sharePhotoPath("token_token_token");
    const [slot] = await withGooglePhotos([row("Brutos", "id-1")], path, found);
    expect(slot?.place?.googlePhotos?.[0]).toEqual({
      src: "/api/share/token_token_token/photo?name=a&w=1000",
      fullSrc: "/api/share/token_token_token/photo?name=a&w=2400",
    });
  });

  it("looks a place up once, however many slots hold it", async () => {
    const found = lookup(async () => details([photo("a")]));
    const slots = await withGooglePhotos([row("Brutos", "id-1"), row("Brutos", "id-1")], undefined, found);
    expect(found).toHaveBeenCalledTimes(1);
    expect(slots.every((slot) => slot.place?.googlePhotos?.length === 1)).toBe(true);
  });

  it("leaves a place on the provider's images when Google fails, has none, or it has no listing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const found = lookup(async (id) => {
      if (id === "fails") throw new Error("Google is down");
      return details(id === "empty" ? [] : [photo("a")]);
    });
    const slots = await withGooglePhotos(
      [row("Fails", "fails"), row("Empty", "empty"), row("No listing", null), row("Fine", "fine")],
      undefined,
      found,
    );
    expect(slots.map((slot) => slot.place?.googlePhotos?.length ?? 0)).toEqual([0, 0, 0, 1]);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("stops waiting for a slow lookup, so one place cannot hold the page", async () => {
    vi.useFakeTimers();
    const found = lookup(() => new Promise<GooglePlaceDetails>(() => {}));
    const pending = withGooglePhotos([row("Slow", "slow")], undefined, found);
    await vi.advanceTimersByTimeAsync(3_000);
    const [slot] = await pending;
    expect(slot?.place?.googlePhotos).toBeUndefined();
  });

  it("does nothing without a server key", async () => {
    vi.stubEnv("GOOGLE_PLACES_SERVER_KEY", "");
    const found = lookup(async () => details([photo("a")]));
    const [slot] = await withGooglePhotos([row("Brutos", "id-1")], undefined, found);
    expect(found).not.toHaveBeenCalled();
    expect(slot?.place?.googlePhotos).toBeUndefined();
  });
});

describe("the shared view", () => {
  const trip = {
    title: "Paris for Sofia",
    destinationName: "Paris",
    startDate: null,
    endDate: null,
    clientName: "Sofia Haddad",
    advisorName: "Daan",
  };

  it("shows Google's photos in place of the provider's, and no place id", () => {
    const base = row("Brutos", "id-1");
    const slot: SharedSlotRow = {
      ...base,
      place: base.place && {
        ...base.place,
        googlePhotos: [{ src: "/api/share/t/photo?name=a&w=1000", fullSrc: "/api/share/t/photo?name=a&w=2400", author: "A" }],
      },
    };
    const view = toSharedTripView(trip, [slot], []);
    const place = view.days[0]?.slots[0]?.place;
    expect(place?.images).toEqual(["/api/share/t/photo?name=a&w=1000"]);
    expect(place?.imageUrl).toBe("/api/share/t/photo?name=a&w=1000");
    expect(place?.googlePhotos).toEqual({
      "/api/share/t/photo?name=a&w=1000": { fullSrc: "/api/share/t/photo?name=a&w=2400", author: "A" },
    });
    expect(JSON.stringify(view)).not.toContain("id-1");
  });

  it("keeps the provider's images when Google has none", () => {
    const place = toSharedTripView(trip, [row("Brutos", "id-1")], []).days[0]?.slots[0]?.place;
    expect(place?.images).toEqual(["https://images.qloo.com/i/a-420x-auto.jpg"]);
    expect(place?.googlePhotos).toBeUndefined();
  });
});
