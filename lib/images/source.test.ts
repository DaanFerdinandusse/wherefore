import { describe, expect, it } from "vitest";

import { fastProviderImage, imagePolicy, nextImage, isProviderHost, providerImageAt, unsplashLoader } from "./source";

describe("fastProviderImage", () => {
  it("asks for the -auto photo of the same provider id", () => {
    expect(fastProviderImage("https://images.qloo.com/i/0D59A7D9-021F-436A-880F-7CDFCD2DD2DA-23nQYW-420x-outside.jpg")).toBe(
      "https://images.qloo.com/i/0D59A7D9-021F-436A-880F-7CDFCD2DD2DA-420x-auto.jpg",
    );
  });

  it("keeps the width of a resized file", () => {
    expect(fastProviderImage("https://images.qloo.com/i/ABC-23nQYW-1200x-outside.jpg")).toBe("https://images.qloo.com/i/ABC-1200x-auto.jpg");
  });

  it("leaves an -auto file, other hosts and relative urls alone", () => {
    for (const url of [
      "https://images.qloo.com/i/ABC-420x-auto.jpg",
      "https://images.test/i/ABC-23nQYW-420x-outside.jpg",
      "/api/places/photo?name=places/abc/photos/def&w=760",
    ]) {
      expect(fastProviderImage(url)).toBe(url);
    }
  });
});

describe("nextImage", () => {
  const outside = "https://images.qloo.com/i/ABC-23nQYW-420x-outside.jpg";
  const auto = "https://images.qloo.com/i/ABC-420x-auto.jpg";

  it("tries the fast photo, then the url it was given, then gives up", () => {
    expect(nextImage(outside, [])).toBe(auto);
    expect(nextImage(outside, [auto])).toBe(outside);
    expect(nextImage(outside, [auto, outside])).toBeUndefined();
  });

  it("gives any other source one try", () => {
    expect(nextImage("/api/places/photo?name=a", [])).toBe("/api/places/photo?name=a");
    expect(nextImage("/api/places/photo?name=a", ["/api/places/photo?name=a"])).toBeUndefined();
  });
});

describe("unsplashLoader", () => {
  it("asks the CDN for the width, in the browser's best format", () => {
    const src = "https://images.unsplash.com/photo-1?crop=entropy&fm=jpg&ixid=abc&q=80&w=1080";
    const url = new URL(unsplashLoader({ src, width: 640 }));
    expect(url.origin + url.pathname).toBe("https://images.unsplash.com/photo-1");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      crop: "entropy",
      ixid: "abc",
      q: "75",
      w: "640",
      auto: "format",
      fit: "max",
    });
  });

  it("marks Unsplash as its own source, off the optimizer's default loader", () => {
    expect(imagePolicy("https://images.unsplash.com/photo-1?w=1080")).toEqual({
      source: "unsplash",
      unoptimized: false,
      placeholder: false,
    });
  });
});

describe("providerImageAt", () => {
  it("changes the width in a provider image's name", () => {
    expect(providerImageAt("https://images.qloo.com/i/A-2mwCpx-420x-outside.jpg", 1600)).toBe(
      "https://images.qloo.com/i/A-2mwCpx-1600x-outside.jpg",
    );
    expect(providerImageAt("https://images.qloo.com/i/A-420x-auto.jpg", 2400)).toBe(
      "https://images.qloo.com/i/A-2400x-auto.jpg",
    );
  });

  it("leaves every other url alone", () => {
    expect(providerImageAt("https://example.test/a-420x-auto.jpg", 1600)).toBe("https://example.test/a-420x-auto.jpg");
    expect(providerImageAt("https://images.qloo.com/i/contramar.jpg", 1600)).toBe("https://images.qloo.com/i/contramar.jpg");
    expect(providerImageAt("/images/hero-420x-auto.jpg", 1600)).toBe("/images/hero-420x-auto.jpg");
  });
});

describe("imagePolicy", () => {
  it("loads provider images directly, lazy and async, with an explicit size", () => {
    const policy = imagePolicy("https://images.qloo.com/i/2F87C895-A5F1-493F-8E93-15FE6466EC9F-420x-outside.jpg");
    expect(policy).toEqual({
      source: "provider",
      unoptimized: true,
      width: 420,
      height: 525,
      loading: "lazy",
      decoding: "async",
      placeholder: true,
    });
  });

  it("reads the encoded width and falls back to 420 without one", () => {
    expect(imagePolicy("https://images.qloo.com/i/ABC-840x-auto.jpg")).toMatchObject({ width: 840, height: 1050 });
    expect(imagePolicy("https://images.qloo.com/d1.jpg")).toMatchObject({ width: 420, height: 525 });
  });

  it("treats every host under qloo.com as a provider host", () => {
    expect(imagePolicy("https://cdn.staging.qloo.com/a.jpg").source).toBe("provider");
    expect(isProviderHost("qloo.com")).toBe(true);
    expect(isProviderHost("IMAGES.QLOO.COM")).toBe(true);
    expect(isProviderHost("notqloo.com")).toBe(false);
    expect(isProviderHost("qloo.com.example.org")).toBe(false);
  });

  it("loads the photo proxy directly: the optimizer cannot send the session", () => {
    expect(imagePolicy("/api/places/photo?name=places%2Fx%2Fphotos%2Fy&w=800")).toMatchObject({
      source: "proxy",
      unoptimized: true,
      loading: "lazy",
      decoding: "async",
      placeholder: true,
    });
    expect(imagePolicy("/api/places/photo?name=a").width).toBeUndefined();
  });

  it("loads a shared trip's photo route directly, like the proxy", () => {
    expect(imagePolicy("/api/share/abc_DEF-123/photo?name=a&w=1000")).toMatchObject({ source: "proxy", unoptimized: true });
    expect(imagePolicy("/api/share/abc/other?name=a").unoptimized).toBe(false);
  });

  it("keeps the optimizer for static files, imports and public hosts", () => {
    expect(imagePolicy("/images/hero.jpg")).toEqual({ source: "other", unoptimized: false, placeholder: false });
    expect(imagePolicy("/api/places/photos-other").unoptimized).toBe(false);
    expect(imagePolicy("https://lh3.googleusercontent.com/a/abc").unoptimized).toBe(false);
    expect(imagePolicy({ src: "/_next/static/media/a.jpg", width: 10, height: 10 }).unoptimized).toBe(false);
    expect(imagePolicy(undefined).unoptimized).toBe(false);
    expect(imagePolicy("not a url").unoptimized).toBe(false);
  });

  it("never sends data and blob URLs to the optimizer", () => {
    expect(imagePolicy("data:image/png;base64,AAAA").unoptimized).toBe(true);
    expect(imagePolicy("blob:http://localhost/123").unoptimized).toBe(true);
  });
});
