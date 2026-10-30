import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureAdvisor } = vi.hoisted(() => ({ ensureAdvisor: vi.fn() }));
vi.mock("../advisor", () => ({ ensureAdvisor }));

import { getOptionalUser, requirePageUser, requireUser } from "../server";
import { sharedUser } from "../shared-user";

describe("shared hackathon workspace", () => {
  beforeEach(() => {
    ensureAdvisor.mockReset().mockResolvedValue({});
  });

  it("gives pages and API requests the same owner without authentication configuration", async () => {
    vi.stubEnv("NEON_AUTH_BASE_URL", "");
    vi.stubEnv("NEON_AUTH_COOKIE_SECRET", "");
    try {
      const users = await Promise.all([getOptionalUser(), requireUser(), requirePageUser()]);
      for (const user of users) {
        expect(user.userId).toBe("tastebrief-demo");
        expect(user.orgIds).toEqual([]);
        expect(ensureAdvisor).toHaveBeenCalledWith(user);
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("does not share mutable organization membership between requests", () => {
    sharedUser().orgIds.push("other-owner-team");
    expect(sharedUser().orgIds).toEqual([]);
  });

  it("surfaces database failures instead of redirecting to login", async () => {
    ensureAdvisor.mockRejectedValue(new Error("Database unavailable"));
    await expect(requirePageUser()).rejects.toThrow("Database unavailable");
  });
});
