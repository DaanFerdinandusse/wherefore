import { describe, expect, it } from "vitest";

import { tripCard } from "./fixtures";
import { agoLabel, cardStatus, needsFavoritesLabel, shareState, totalSlots } from "./status";

const today = "2026-11-10";
const now = new Date("2026-11-10T15:00:00Z");
const shared = (overrides: Parameters<typeof tripCard>[0] = {}) =>
  tripCard({ stage: "shared", shareToken: "tok", sharedAt: new Date("2026-11-06T09:00:00Z"), ...overrides });

describe("planning", () => {
  it("counts filled slots against every slot of every day", () => {
    const card = tripCard({ counts: { filledSlots: 3, days: 5 } });
    expect(totalSlots(card)).toBe(30);
    expect(cardStatus(card, today, now)).toMatchObject({ icon: "slots", text: "3 of 30 slots filled" });
  });

  it("says places are ready when there are places and no slot is filled", () => {
    const status = cardStatus(tripCard({ counts: { filledSlots: 0, places: 16 } }), today, now);
    expect(status).toMatchObject({ icon: "sparkle", text: "16 places ready", tone: "accent" });
  });

  it("says there are no places yet, or that a search runs", () => {
    expect(cardStatus(tripCard({ counts: { filledSlots: 0, places: 0 } }), today, now).text).toBe("No places yet");
    const running = tripCard({
      counts: { filledSlots: 0, places: 0 },
      lastAsk: { status: "running", resultCount: 0, updatedAt: now },
    });
    expect(cardStatus(running, today, now).text).toBe("Searching");
  });

  it("asks for the client's favorites before anything else", () => {
    const card = tripCard({ clientName: "Jonas Berg", clientFavorites: 0 });
    expect(cardStatus(card, today, now)).toMatchObject({ icon: "heart", text: "Needs Jonas's favorites" });
    expect(needsFavoritesLabel("James Hall")).toBe("Needs James's favorites");
  });

  it("warns when the first list failed", () => {
    expect(cardStatus(tripCard({ seedStatus: "failed" }), today, now).tone).toBe("warning");
  });
});

describe("shared", () => {
  it("says when the traveler last opened the link", () => {
    const card = shared({ shareLastOpenedAt: new Date("2026-11-09T10:00:00Z") });
    expect(cardStatus(card, today, now)).toMatchObject({ icon: "eye", text: "Opened yesterday" });
  });

  it("says how long the link has gone unopened", () => {
    expect(cardStatus(shared(), today, now)).toMatchObject({
      icon: "eye-off",
      text: "Not opened in 4 days",
      tone: "strong",
    });
    expect(cardStatus(shared({ sharedAt: new Date("2026-11-10T08:00:00Z") }), today, now).text).toBe("Sent today");
  });

  it("claims nothing about opens for links shared before opens were recorded", () => {
    const old = shared({ sharedAt: new Date("2026-10-01T09:00:00Z"), shareOpensTracked: false });
    expect(shareState(old, now).kind).toBe("unknown");
    expect(cardStatus(old, today, now).text).toBe("Sent 40 days ago");
  });

  it("says there is no link when the stage was set by hand", () => {
    expect(cardStatus(tripCard({ stage: "shared" }), today, now).text).toBe("No link yet");
  });
});

describe("traveling", () => {
  const traveling = { stage: "traveling" as const, startDate: "2026-11-09", endDate: "2026-11-13" };
  it("shows the day and whether tonight is open", () => {
    expect(cardStatus(tripCard({ ...traveling, counts: { tonightFilled: 0 } }), today, now).text).toBe(
      "Day 2 of 5, tonight open",
    );
    expect(cardStatus(tripCard({ ...traveling, counts: { tonightFilled: 1 } }), today, now).text).toBe("Day 2 of 5");
  });
});

describe("done", () => {
  it("says when the trip finished", () => {
    expect(cardStatus(tripCard({ stage: "done" }), today, now).text).toBe("Finished 18 May");
  });
});

describe("agoLabel", () => {
  it("reads today, yesterday and days", () => {
    expect(agoLabel(new Date("2026-11-10T01:00:00Z"), now)).toBe("today");
    expect(agoLabel(new Date("2026-11-09T14:00:00Z"), now)).toBe("yesterday");
    expect(agoLabel(new Date("2026-11-01T14:00:00Z"), now)).toBe("9 days ago");
  });
});
