import { describe, expect, it } from "vitest";

import { board, tripCard } from "./fixtures";
import { buildNudges, nudgeMessage, QUIET_NUDGE, summaryLine } from "./nudges";

const today = "2027-05-11";

describe("buildNudges", () => {
  it("is quiet when nothing needs the advisor", () => {
    const nudges = buildNudges(board([tripCard({ startDate: "2027-08-01", endDate: "2027-08-05" })]), today);
    expect(nudges).toEqual([]);
    expect(nudgeMessage(nudges)).toBe(QUIET_NUDGE);
  });

  it("flags a trip leaving soon with empty days first", () => {
    const marcus = tripCard({
      id: "m",
      clientName: "Marcus Lee",
      destination: { name: "Tokyo", lat: 35.68, lon: 139.69, radiusM: 20000 },
      startDate: "2027-05-14",
      endDate: "2027-05-18",
      counts: { emptyDays: 2 },
    });
    const priya = tripCard({
      id: "p",
      clientName: "Priya Shah",
      stage: "traveling",
      startDate: "2027-05-10",
      endDate: "2027-05-14",
    });
    const nudges = buildNudges(board([priya, marcus]), today);
    expect(nudges.map((n) => n.tripId)).toEqual(["m", "p"]);
    expect(nudges[0]).toMatchObject({ text: "Marcus leaves for Tokyo in 3 days, 2 days still empty.", action: "Open Tokyo" });
    expect(nudges[1].text).toBe("Priya is in Lisbon, day 2 of 5.");
    expect(nudgeMessage(nudges)).toBe(`${nudges[0].text} ${nudges[1].text}`);
  });

  it("says tomorrow and leaves out empty days when the itinerary is full", () => {
    const card = tripCard({ startDate: "2027-05-12", endDate: "2027-05-14", counts: { emptyDays: 0 } });
    expect(buildNudges(board([card]), today)[0].text).toBe("Ana leaves for Lisbon tomorrow.");
  });

  it("reports a failed first list and ignores done trips", () => {
    const failed = tripCard({ id: "f", seedStatus: "failed", startDate: null, endDate: null });
    const done = tripCard({ id: "d", stage: "done", startDate: "2027-05-01", endDate: "2027-05-09" });
    const nudges = buildNudges(board([failed, done]), today);
    expect(nudges.map((n) => n.tripId)).toEqual(["f"]);
    expect(nudges[0].text).toBe("The first list for Lisbon for Ana could not be built.");
  });

  it("keeps at most the limit", () => {
    const cards = ["a", "b", "c", "d"].map((id) => tripCard({ id, startDate: "2027-05-13", endDate: "2027-05-15" }));
    expect(buildNudges(board(cards), today)).toHaveLength(3);
  });
});

describe("summaryLine", () => {
  it("counts trips in progress and names who is traveling", () => {
    const grouped = board([
      tripCard({ id: "a" }),
      tripCard({ id: "b", stage: "traveling", clientName: "Priya Shah", startDate: "2027-05-10", endDate: "2027-05-14" }),
      tripCard({ id: "c", stage: "done" }),
    ]);
    expect(summaryLine(grouped, today)).toBe("2 trips in progress. Priya is on day 2 in Lisbon.");
  });
  it("handles an empty board", () => {
    expect(summaryLine(board([]), today)).toBe("No trips in progress.");
  });
});
