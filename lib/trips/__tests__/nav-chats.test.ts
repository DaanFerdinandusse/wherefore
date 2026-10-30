import { describe, expect, it } from "vitest";

import { activeChatId, chatTimeLabel, groupChatsByTrip } from "../nav-chats";

// Local times on purpose: the label reads the viewer's calendar.
const now = new Date(2026, 9, 29, 15, 0); // Thu 29 Oct 2026, 15:00

describe("chatTimeLabel", () => {
  it("says Now within the hour", () => {
    expect(chatTimeLabel(new Date(2026, 9, 29, 14, 30), now)).toBe("Now");
    expect(chatTimeLabel(new Date(2026, 9, 29, 15, 2), now)).toBe("Now");
  });

  it("says Today, Yesterday, then the weekday within a week", () => {
    expect(chatTimeLabel(new Date(2026, 9, 29, 9, 0), now)).toBe("Today");
    expect(chatTimeLabel(new Date(2026, 9, 28, 23, 30), now)).toBe("Yesterday");
    expect(chatTimeLabel(new Date(2026, 9, 26, 12, 0), now)).toBe("Mon");
    expect(chatTimeLabel(new Date(2026, 9, 23, 12, 0), now)).toBe("Fri");
  });

  it("gives the date after a week, with the year when it differs", () => {
    expect(chatTimeLabel(new Date(2026, 9, 22, 12, 0), now)).toBe("22 Oct");
    expect(chatTimeLabel(new Date(2025, 11, 31, 12, 0), now)).toBe("31 Dec 2025");
  });
});

describe("groupChatsByTrip", () => {
  it("groups in order and caps each trip", () => {
    const at = new Date("2026-10-29T10:00:00Z");
    const chats = [
      { id: "c1", tripId: "a", title: "One", updatedAt: at },
      { id: "c2", tripId: "b", title: null, updatedAt: at },
      { id: "c3", tripId: "a", title: "Three", updatedAt: at },
      { id: "c4", tripId: "a", title: "Four", updatedAt: at },
    ];
    const grouped = groupChatsByTrip(chats, 2);
    expect(grouped.get("a")?.map((c) => c.id)).toEqual(["c1", "c3"]);
    expect(grouped.get("b")).toEqual([{ id: "c2", title: null, updatedAt: at.toISOString() }]);
  });
});

describe("activeChatId", () => {
  const chats = [
    { id: "new", title: null, updatedAt: "" },
    { id: "old", title: "Old", updatedAt: "" },
  ];
  it("is the chat in the URL, else the newest", () => {
    expect(activeChatId(chats, "old")).toBe("old");
    expect(activeChatId(chats, null)).toBe("new");
    expect(activeChatId([], null)).toBeUndefined();
  });
});
