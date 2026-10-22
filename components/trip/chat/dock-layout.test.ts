import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PEEK_HEIGHT,
  collapsedKey,
  collapsedSnapshot,
  isAtBottom,
  listMaxHeight,
  listMode,
  subscribeCollapsed,
  writeCollapsed,
} from "./dock-layout";

describe("listMode", () => {
  it("hides the list when collapsed, whatever else holds", () => {
    expect(listMode({ collapsed: true, expanded: true })).toBe("hidden");
    expect(listMode({ collapsed: true, expanded: false })).toBe("hidden");
  });
  it("peeks at rest and opens when expanded", () => {
    expect(listMode({ collapsed: false, expanded: false })).toBe("peek");
    expect(listMode({ collapsed: false, expanded: true })).toBe("open");
  });
});

describe("isAtBottom", () => {
  it("counts the last few pixels as the bottom", () => {
    expect(isAtBottom({ scrollTop: 500, scrollHeight: 800, clientHeight: 300 })).toBe(true);
    expect(isAtBottom({ scrollTop: 480, scrollHeight: 800, clientHeight: 300 })).toBe(true);
    expect(isAtBottom({ scrollTop: 400, scrollHeight: 800, clientHeight: 300 })).toBe(false);
  });
});

describe("listMaxHeight", () => {
  it("peeks at rest", () => {
    expect(listMaxHeight("peek", 600, false)).toBe(PEEK_HEIGHT);
  });
  it("fits the last turn while open, never below the peek", () => {
    expect(listMaxHeight("open", 180.4, false)).toBe(181);
    expect(listMaxHeight("open", 10, false)).toBe(PEEK_HEIGHT);
  });
  it("leaves the cap to the dock while reading back or before a measure", () => {
    expect(listMaxHeight("open", 180, true)).toBeUndefined();
    expect(listMaxHeight("open", null, false)).toBeUndefined();
    expect(listMaxHeight("hidden", 180, false)).toBeUndefined();
  });
});

describe("collapsed per chat", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("remembers the flag per chat and notifies subscribers", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeCollapsed(listener);
    writeCollapsed("chat-a", true);
    expect(store.get(collapsedKey("chat-a"))).toBe("1");
    expect(collapsedSnapshot("chat-a")).toBe(true);
    expect(collapsedSnapshot("chat-b")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    writeCollapsed("chat-a", false);
    expect(store.has(collapsedKey("chat-a"))).toBe(false);
    expect(collapsedSnapshot("chat-a")).toBe(false);
    unsubscribe();
  });

  it("still toggles for this visit when storage throws", () => {
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(collapsedSnapshot("chat-c")).toBe(false);
    writeCollapsed("chat-c", true);
    expect(collapsedSnapshot("chat-c")).toBe(true);
  });
});
