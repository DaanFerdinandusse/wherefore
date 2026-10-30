import { describe, expect, it } from "vitest";

import type { GooglePhoto } from "@/lib/google/contracts";

import { placePhotos } from "./place-photos";

const google: GooglePhoto[] = [
  { name: "one", url: "/tile-1", cardUrl: "/card-1", fullUrl: "/full-1", attributions: [{ displayName: "A Visitor" }] },
  { name: "two", url: "/tile-2", cardUrl: "/card-2", fullUrl: "/full-2", attributions: [] },
];
const provider = [{ url: "https://images.test/a.jpg" }, { url: "https://images.test/b.jpg" }];

describe("placePhotos", () => {
  it("shows only Google's photos once it has them, in Google's order", () => {
    expect(placePhotos("Brutos", provider, undefined, google)).toEqual([
      { src: "/tile-1", fullSrc: "/full-1", alt: "Brutos, photo 1", attributions: [{ displayName: "A Visitor" }] },
      { src: "/tile-2", fullSrc: "/full-2", alt: "Brutos, photo 2", attributions: [] },
    ]);
  });

  it("gives the chat card its smaller copies, and keeps the full size for the viewer", () => {
    expect(placePhotos("Brutos", provider, undefined, google, "card")[0]).toMatchObject({ src: "/card-1", fullSrc: "/full-1" });
  });

  it("uses the provider's images while Google loads or when it has none", () => {
    const expected = [
      { src: "https://images.test/a.jpg", alt: "Brutos, photo 1" },
      { src: "https://images.test/b.jpg", alt: "Brutos, photo 2" },
    ];
    expect(placePhotos("Brutos", provider, undefined, undefined)).toEqual(expected);
    expect(placePhotos("Brutos", provider, undefined, [])).toEqual(expected);
  });

  it("falls back to the card's image, then to nothing", () => {
    expect(placePhotos("Brutos", [], "https://images.test/card.jpg", undefined)).toEqual([
      { src: "https://images.test/card.jpg", alt: "Brutos, photo 1" },
    ]);
    expect(placePhotos("Brutos", undefined, undefined, undefined)).toEqual([]);
  });
});
