import { describe, expect, it } from "vitest";

import { creditLink, firstCoverPhoto } from "./map";

const photo = (over: Record<string, unknown> = {}) => ({
  urls: { regular: "https://images.unsplash.com/photo-1?ixid=a&w=1080" },
  alt_description: "A yellow tram in Lisbon",
  description: "Tram 28",
  user: { name: "Aayush Gupta", links: { html: "https://unsplash.com/@aayush" } },
  links: { download_location: "https://api.unsplash.com/photos/1/download?ixid=a" },
  ...over,
});

describe("firstCoverPhoto", () => {
  it("maps the first photo to a cover with its credit and download endpoint", () => {
    expect(firstCoverPhoto({ results: [photo(), photo({ alt_description: "Second" })] })).toEqual({
      cover: {
        url: "https://images.unsplash.com/photo-1?ixid=a&w=1080",
        alt: "A yellow tram in Lisbon",
        creditName: "Aayush Gupta",
        creditUrl: "https://unsplash.com/@aayush?utm_source=wherefore&utm_medium=referral",
      },
      downloadLocation: "https://api.unsplash.com/photos/1/download?ixid=a",
    });
  });

  it("falls back to the description, then to no alt text", () => {
    expect(firstCoverPhoto({ results: [photo({ alt_description: null })] })?.cover.alt).toBe("Tram 28");
    expect(firstCoverPhoto({ results: [photo({ alt_description: null, description: null })] })?.cover.alt).toBe("");
  });

  it("skips a photo it cannot credit or report", () => {
    const noCredit = photo({ user: { name: " ", links: { html: "https://unsplash.com/@x" } } });
    const elsewhere = photo({ links: { download_location: "https://example.com/download" } });
    expect(firstCoverPhoto({ results: [noCredit, elsewhere, photo()] })?.cover.creditName).toBe("Aayush Gupta");
  });

  it("gives null when there is nothing to use", () => {
    expect(firstCoverPhoto({ results: [] })).toBeNull();
    expect(firstCoverPhoto({ errors: ["Rate Limit Exceeded"] })).toBeNull();
    expect(firstCoverPhoto(null)).toBeNull();
  });
});

describe("creditLink", () => {
  it("keeps the link's own params", () => {
    expect(creditLink("https://unsplash.com/?a=1")).toBe("https://unsplash.com/?a=1&utm_source=wherefore&utm_medium=referral");
  });
});
