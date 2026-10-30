import { describe, expect, it } from "vitest";

import { board, tripCard } from "./fixtures";
import { buildNudges, mailtoHref, nudgeDraft, summaryLine } from "./nudges";

const today = "2026-11-10";
const now = new Date("2026-11-10T15:00:00Z");
const url = (token: string) => `https://wherefore.app/s/${token}`;
const tokyo = { name: "Tokyo", lat: 35.68, lon: 139.69, radiusM: 20000 };

describe("buildNudges", () => {
  it("is empty when nothing needs the advisor", () => {
    expect(buildNudges(board([tripCard({ startDate: "2027-08-01", endDate: "2027-08-05" })]), today, now, url)).toEqual(
      [],
    );
  });

  it("flags a link not opened for days with a draft", () => {
    const marcus = tripCard({
      id: "m",
      stage: "shared",
      clientName: "Marcus Lee",
      destination: tokyo,
      startDate: "2026-12-03",
      endDate: "2026-12-09",
      shareToken: "tok",
      sharedAt: new Date("2026-11-06T09:00:00Z"),
    });
    const [nudge] = buildNudges(board([marcus]), today, now, url);
    expect(nudge).toMatchObject({
      kind: "not-opened",
      title: "Marcus hasn't opened Tokyo",
      detail: "Sent 4 days ago · leaves 3 Dec",
    });
    expect(nudge.draft?.url).toBe("https://wherefore.app/s/tok");
    expect(nudge.draft?.message).toContain("Hi Marcus, your Tokyo itinerary is ready: https://wherefore.app/s/tok");
  });

  it("stays quiet about a link sent yesterday, opened, or shared before opens were recorded", () => {
    const base = { stage: "shared" as const, shareToken: "tok", startDate: "2026-12-03", endDate: "2026-12-09" };
    const cards = [
      tripCard({ ...base, id: "a", sharedAt: new Date("2026-11-09T09:00:00Z") }),
      tripCard({ ...base, id: "b", sharedAt: new Date("2026-11-01T09:00:00Z"), shareLastOpenedAt: now }),
      tripCard({ ...base, id: "c", sharedAt: new Date("2026-10-01T09:00:00Z"), shareOpensTracked: false }),
    ];
    expect(buildNudges(board(cards), today, now, url)).toEqual([]);
  });

  it("puts a traveler with tonight open first", () => {
    const priya = tripCard({
      id: "p",
      stage: "traveling",
      clientName: "Priya Shah",
      startDate: "2026-11-09",
      endDate: "2026-11-13",
      imageUrl: "https://example.test/lisbon.jpg",
      counts: { tonightFilled: 0 },
    });
    const planned = tripCard({ ...priya, id: "q", counts: { ...priya.counts, tonightFilled: 2 } });
    const nadia = tripCard({
      id: "n",
      clientName: "Nadia Haddad",
      destination: { name: "Marrakech", lat: 31.63, lon: -8, radiusM: 10000 },
      startDate: "2027-02-02",
      endDate: "2027-02-07",
      lastAsk: { status: "done", resultCount: 16, updatedAt: new Date("2026-11-09T10:00:00Z") },
      counts: { places: 16, filledSlots: 0 },
    });
    const nudges = buildNudges(board([nadia, planned, priya]), today, now, url);
    expect(nudges.map((n) => n.tripId)).toEqual(["p", "n"]);
    expect(nudges[0]).toMatchObject({ title: "Priya is in Lisbon", detail: "Day 2 of 5 · tonight is still open", live: true });
    expect(nudges[1]).toMatchObject({ title: "Nadia's Marrakech search is done", detail: "16 places ready to review" });
  });

  it("says nothing about a search that is old, or whose places are already placed", () => {
    const ask = { status: "done", resultCount: 16, updatedAt: new Date("2026-11-01T10:00:00Z") };
    const old = tripCard({ id: "o", lastAsk: ask, counts: { places: 16, filledSlots: 0 } });
    const placed = tripCard({ id: "p", lastAsk: { ...ask, updatedAt: now }, counts: { places: 16, filledSlots: 4 } });
    expect(buildNudges(board([old, placed]), today, now, url)).toEqual([]);
  });

  it("flags a departure within a week with empty days", () => {
    const card = tripCard({ startDate: "2026-11-13", endDate: "2026-11-15", counts: { emptyDays: 2 } });
    expect(buildNudges(board([card]), today, now, url)[0]).toMatchObject({
      kind: "leaving-soon",
      title: "Ana leaves for Lisbon in 3 days",
      detail: "2 days still empty",
    });
    const tomorrow = tripCard({ startDate: "2026-11-11", endDate: "2026-11-15", counts: { emptyDays: 1 } });
    expect(buildNudges(board([tomorrow]), today, now, url)[0].title).toBe("Ana leaves for Lisbon tomorrow");
  });

  it("keeps at most three", () => {
    const cards = ["a", "b", "c", "d"].map((id) =>
      tripCard({ id, startDate: "2026-11-12", endDate: "2026-11-14", counts: { emptyDays: 1 } }),
    );
    expect(buildNudges(board(cards), today, now, url)).toHaveLength(3);
  });
});

describe("drafts", () => {
  it("builds a mailto with subject and body and no recipient", () => {
    const draft = nudgeDraft(tripCard({ clientName: "Marcus Lee", destination: tokyo, startDate: null }), "https://x.test/s/a");
    expect(draft.message).not.toContain("You leave");
    expect(mailtoHref(draft)).toBe(
      `mailto:?subject=${encodeURIComponent("Your Tokyo itinerary")}&body=${encodeURIComponent(draft.message)}`,
    );
  });
});

describe("summaryLine", () => {
  it("counts trips in progress and done, with the drag hint on the board", () => {
    const totals = { planning: 3, shared: 2, traveling: 1, done: 12 };
    expect(summaryLine(totals, "board")).toBe("6 in progress, 12 done. Drag a card to move it along.");
    expect(summaryLine(totals, "list")).toBe("6 in progress, 12 done.");
    expect(summaryLine({ ...totals, done: 0 }, "list")).toBe("6 in progress.");
    expect(summaryLine({ planning: 0, shared: 0, traveling: 0, done: 0 }, "board")).toBe("No trips yet.");
  });
});
