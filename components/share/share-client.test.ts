import { describe, expect, it } from "vitest";

import { readShareError } from "./share-client";

describe("readShareError", () => {
  it("reads the route's error message", async () => {
    const response = Response.json({ error: { code: "not_found", message: "No trip with that id." } }, { status: 404 });
    expect(await readShareError(response, "fallback")).toBe("No trip with that id.");
  });

  it("asks to sign in again on 401", async () => {
    const response = Response.json({ error: { code: "unauthorized", message: "Sign in to continue." } }, { status: 401 });
    expect(await readShareError(response, "fallback")).toBe("Your session ended. Sign in again to share.");
  });

  it("falls back when the body is not the error shape", async () => {
    expect(await readShareError(new Response("oops", { status: 500 }), "fallback")).toBe("fallback");
  });
});
