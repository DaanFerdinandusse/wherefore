import { describe, expect, it } from "vitest";

import { InvalidInputError } from "@/lib/auth/errors";

import {
  LIST_LINK_INVALID,
  LIST_UNAVAILABLE,
  LIST_UNREADABLE,
  linkIn,
  listRefOf,
  parseSharedList,
  readSharedList,
  unsignedCid,
} from "./shared-list";

// The shape the endpoint answers with, cut down to what the parser reads.
function row(name: string, lat: number, lon: number, cid: string | null, note = "") {
  return [null, [null, null, name, null, "An address", [null, null, lat, lon], cid ? ["1", cid] : null, "/g/abc"], name, note];
}

function body(rows: unknown[], title: unknown = "Food") {
  const list = Array.from({ length: 13 }, () => null) as unknown[];
  list[4] = title;
  list[8] = rows;
  list[12] = rows.length;
  return [list];
}

function answer(data: unknown): Response {
  return new Response(`)]}'\n${JSON.stringify(data)}`, { status: 200 });
}

const REDIRECT = "https://www.google.com/maps/placelists/list/mur2Du-Sr?skid=1";

function fakeFetch(handler: (url: string, init?: RequestInit) => Response) {
  const urls: string[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    urls.push(url);
    return handler(url, init);
  }) as typeof fetch;
  return { fetcher, urls };
}

describe("linkIn", () => {
  it("finds the link in Google's share text, after the list's title", () => {
    expect(linkIn("Food 🍱 · daan\nhttps://maps.app.goo.gl/vXAG?g_st=i")?.href).toBe("https://maps.app.goo.gl/vXAG?g_st=i");
  });

  it("is null without a url", () => {
    expect(linkIn("Food list")).toBeNull();
  });
});

describe("listRefOf", () => {
  it("reads both url forms", () => {
    expect(listRefOf("https://www.google.com/maps/placelists/list/mur2Du-Sr?skid=1")).toEqual({ id: "mur2Du-Sr" });
    expect(listRefOf("https://www.google.com/maps/@/data=!3m1!4b1!4m3!11m2!2soq0an0dT!3e3?entry=tts")).toEqual({ id: "oq0an0dT" });
  });

  it("keeps a token", () => {
    expect(listRefOf("https://www.google.com/maps/placelists/list/abc?token=t0k")).toEqual({ id: "abc", token: "t0k" });
  });

  it("is null for a url without a list", () => {
    expect(listRefOf("https://www.google.com/maps/place/Quintonil")).toBeNull();
  });
});

describe("unsignedCid", () => {
  it("turns a negative CID into the value Qloo's id decodes to", () => {
    expect(unsignedCid("-1")).toBe("18446744073709551615");
    expect(unsignedCid("1047725080642144831")).toBe("1047725080642144831");
  });

  it("is null for what is not a number", () => {
    expect(unsignedCid("0x12")).toBeNull();
  });
});

describe("parseSharedList", () => {
  it("reads the title and each place", () => {
    expect(parseSharedList(body([row("Quintonil", 19.43, -99.19, "-5")]))).toEqual({
      title: "Food",
      places: [{ name: "Quintonil", lat: 19.43, lon: -99.19, googleId: "18446744073709551611" }],
    });
  });

  it("skips an entry without coordinates and keeps a place without an id", () => {
    const list = parseSharedList(body([[null, [null], "No spot"], row("No id", 1, 2, null)]));
    expect(list?.places).toEqual([{ name: "No id", lat: 1, lon: 2, googleId: null }]);
  });

  it("names a list without a title", () => {
    expect(parseSharedList(body([], null))?.title).toBe("Google Maps list");
  });

  it("is null for an answer that is not a list", () => {
    expect(parseSharedList(null)).toBeNull();
    expect(parseSharedList([null])).toBeNull();
    expect(parseSharedList([[1, 2, 3]])).toBeNull();
  });
});

describe("readSharedList", () => {
  it("follows a short link one hop and reads the list", async () => {
    const { fetcher, urls } = fakeFetch((url) =>
      url.startsWith("https://maps.app.goo.gl")
        ? new Response(null, { status: 302, headers: { location: REDIRECT } })
        : answer(body([row("Quintonil", 19.43, -99.19, "7")])),
    );
    const list = await readSharedList("Food 🍱 · daan\nhttps://maps.app.goo.gl/vXAG", { fetch: fetcher });
    expect(list.places.map((p) => p.name)).toEqual(["Quintonil"]);
    expect(urls[1]).toContain("/maps/preview/entitylist/getlist");
    expect(decodeURIComponent(urls[1])).toContain("/maps/placelists/list/mur2Du-Sr");
  });

  it("reads a full url without resolving it", async () => {
    const { fetcher, urls } = fakeFetch(() => answer(body([row("Quintonil", 19.43, -99.19, "7")])));
    await readSharedList(REDIRECT, { fetch: fetcher });
    expect(urls).toHaveLength(1);
  });

  it("never fetches a link to another host", async () => {
    const { fetcher, urls } = fakeFetch(() => answer([]));
    await expect(readSharedList("https://example.com/maps/placelists/list/abc", { fetch: fetcher })).rejects.toThrow(LIST_LINK_INVALID);
    expect(urls).toHaveLength(0);
  });

  it("does not follow a short link off Google Maps", async () => {
    const { fetcher, urls } = fakeFetch(() => new Response(null, { status: 302, headers: { location: "https://example.com/x!2sabc!" } }));
    await expect(readSharedList("https://maps.app.goo.gl/vXAG", { fetch: fetcher })).rejects.toThrow(LIST_LINK_INVALID);
    expect(urls).toHaveLength(1);
  });

  it("names a list it cannot read", async () => {
    const { fetcher } = fakeFetch(() => answer(body([])));
    await expect(readSharedList(REDIRECT, { fetch: fetcher })).rejects.toThrow(LIST_UNREADABLE);
    const garbled = fakeFetch(() => new Response("<html>", { status: 200 }));
    await expect(readSharedList(REDIRECT, { fetch: garbled.fetcher })).rejects.toThrow(LIST_UNREADABLE);
  });

  it("names an upstream that did not answer, as an input error the profile can show", async () => {
    const { fetcher } = fakeFetch(() => new Response("", { status: 500 }));
    const error = await readSharedList(REDIRECT, { fetch: fetcher }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidInputError);
    expect((error as Error).message).toBe(LIST_UNAVAILABLE);
  });
});
