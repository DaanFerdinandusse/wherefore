import { describe, expect, it } from "vitest";

import { HOME_PATH, safeNextPath } from "../next-path";

describe("safeNextPath", () => {
  it("keeps a local path with its query and hash", () => {
    expect(safeNextPath("/trips/abc?view=map&tab=x#day-2")).toBe("/trips/abc?view=map&tab=x#day-2");
    expect(safeNextPath("/clients")).toBe("/clients");
  });

  it("falls back for empty and non-path values", () => {
    for (const value of [null, undefined, "", "trips", "https://evil.example", "javascript:alert(1)"]) {
      expect(safeNextPath(value)).toBe(HOME_PATH);
    }
  });

  it("refuses protocol-relative and backslash tricks", () => {
    for (const value of ["//evil.example", "/\\evil.example", "/\\/evil.example", "\\\\evil.example"]) {
      expect(safeNextPath(value)).toBe(HOME_PATH);
    }
  });

  it("refuses control characters the URL parser would strip", () => {
    // ?next=%2F%09%2Fevil.example arrives decoded as "/\t/evil.example".
    const decoded = new URLSearchParams("next=%2F%09%2Fevil.example").get("next");
    expect(decoded).toBe("/\t/evil.example");
    expect(safeNextPath(decoded)).toBe(HOME_PATH);
    expect(safeNextPath("/\n/evil.example")).toBe(HOME_PATH);
    expect(safeNextPath("/\r/evil.example")).toBe(HOME_PATH);
    expect(safeNextPath("/trips\u0000")).toBe(HOME_PATH);
  });

  it("refuses paths that normalize into a protocol-relative one", () => {
    expect(safeNextPath("/a/../..//evil.example")).toBe(HOME_PATH);
    expect(safeNextPath("/./evil.example")).toBe("/evil.example");
  });

  it("returns the normalized path", () => {
    expect(safeNextPath("/trips/./abc/../def")).toBe("/trips/def");
  });

  it("never sends the advisor back to the auth pages or an API route", () => {
    for (const value of ["/sign-in", "/sign-up?next=/trips", "/api/chats/1", "/api"]) {
      expect(safeNextPath(value)).toBe(HOME_PATH);
    }
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.example", "/clients")).toBe("/clients");
  });
});
