import { describe, expect, it } from "vitest";

import { imagePolicy, isProviderHost } from "./source";

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
