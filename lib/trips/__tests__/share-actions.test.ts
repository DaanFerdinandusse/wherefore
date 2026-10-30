import { afterEach, describe, expect, it, vi } from "vitest";

import { shareUrl } from "../share-actions";

describe("shareUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the link from APP_URL without a double slash", () => {
    vi.stubEnv("APP_URL", "https://wherefore.app/");
    expect(shareUrl("PlE87wF46m2u9gLKWOCuIu_7", "http://localhost:3000")).toBe(
      "https://wherefore.app/s/PlE87wF46m2u9gLKWOCuIu_7",
    );
  });

  it("falls back to the request origin without APP_URL", () => {
    vi.stubEnv("APP_URL", "");
    expect(shareUrl("abc_DEF-123", "http://localhost:3000")).toBe("http://localhost:3000/s/abc_DEF-123");
  });
});
