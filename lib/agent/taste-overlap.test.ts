import { describe, expect, it } from "vitest";

import type { Explainability, PlaceTag } from "@/lib/contracts";

import { carryTags, likeDriver, likeLine, mediaDriver, mediaNotes, overlapTags, searchTags, tagPhrase, withOverlap, type FavoritePlace } from "./taste-overlap";

const AMBIENCE = "urn:tag:ambience:qloo";
const DECOR = "urn:tag:decor:qloo";
const CUISINE = "urn:tag:cuisine:qloo";
const STYLE = "urn:tag:culinary_style:qloo";

const tag = (name: string, type: string = AMBIENCE): PlaceTag => ({ tagId: `urn:tag:x:${name}`, name, type });
const tags = (type: string, ...names: string[]) => names.map((name) => tag(name, type));

const via = [...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Warm", "Stylish", "Cozy", "Casual")];
const lilia = [...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Stylish"), ...tags(DECOR, "Industrial")];
const daNoi = [...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Warm", "Stylish", "Casual")];

describe("overlapTags", () => {
  const search = searchTags([daNoi]);

  it("matches on the name, case insensitive, across the taste families only", () => {
    const candidate = [tag("italian", CUISINE), tag("WARM", DECOR), tag("Stylish", "urn:tag:interests:qloo"), tag("Tourists", "urn:tag:customer_identity:qloo")];
    const favorite = [tag("Italian", STYLE), tag("warm", AMBIENCE), tag("Stylish", "urn:tag:interests:qloo"), tag("Tourists", "urn:tag:customer_identity:qloo")];
    expect(overlapTags(candidate, favorite, search)).toEqual(["italian", "WARM"]);
  });

  it("takes each name once when a place carries it in two families", () => {
    const candidate = [tag("Cozy", AMBIENCE), tag("Cozy", DECOR), tag("Warm")];
    expect(overlapTags(candidate, [tag("cozy", DECOR), tag("warm")], searchTags([candidate]))).toEqual(["Cozy", "Warm"]);
  });

  it("leaves out empty words", () => {
    const empty = tags(AMBIENCE, "Casual", "Modern", "Urban", "Contemporary");
    expect(overlapTags([...empty, tag("Warm")], [...empty, tag("Warm")], searchTags([empty]))).toEqual(["Warm"]);
    expect(overlapTags([tag("Michelin star", STYLE)], [tag("Michelin star", STYLE)], searchTags([]))).toEqual([]);
  });

  it("puts a tag every candidate of the search carries last, even a cuisine", () => {
    const other = [...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Lively")];
    const third = [...tags(CUISINE, "Italian")];
    expect(overlapTags(daNoi, via, searchTags([daNoi, other, third]))).toEqual(["Warm", "Stylish", "Italian"]);
  });

  it("prefers the tag fewer candidates carry", () => {
    const candidate = tags(AMBIENCE, "Lively", "Warm");
    const others = [tags(AMBIENCE, "Lively"), tags(AMBIENCE, "Lively")];
    expect(overlapTags(candidate, candidate, searchTags([candidate, ...others]))).toEqual(["Warm", "Lively"]);
  });

  it("does not repeat itself", () => {
    const candidate = [tag("Rustic chic"), tag("Rustic"), tag("Warm")];
    expect(overlapTags(candidate, candidate, searchTags([candidate, []]))).toEqual(["Rustic chic", "Warm"]);
  });

  it("shows three at most", () => {
    const candidate = tags(AMBIENCE, "Warm", "Stylish", "Cozy", "Lively");
    expect(overlapTags(candidate, candidate, searchTags([candidate]))).toHaveLength(3);
  });
});

/** Favorite places, restaurants unless a kind is given. */
const eat = (tags: FavoritePlace["tags"]): FavoritePlace => ({ tags, category: "eat" });

describe("withOverlap", () => {
  const drivers: Explainability = [
    { entityId: "e-lilia", name: "Lilia", share: 26 },
    { entityId: "e-via", name: "Via Carota", share: 25 },
    { entityId: "advisor", name: "Your places", share: 25 },
    { entityId: "other", name: "Other favorites", share: 24 },
  ];
  const favorites = new Map([
    ["e-via", eat(via)],
    ["e-lilia", eat(lilia)],
  ]);
  const candidate = { entityId: "e-da-noi", tags: daNoi, category: "eat" as const };
  const search = searchTags([daNoi, tags(AMBIENCE, "Lively")]);

  it("reads the target line from the live data", () => {
    const tagged = withOverlap(candidate, drivers, favorites, search);
    expect(likeLine(tagged)).toBe("Like Via Carota: Italian, warm, stylish");
    expect(tagged.filter((d) => d.tags)).toHaveLength(1);
  });

  it("does not hand every place to the favorite with the most tags", () => {
    const moody = tags(AMBIENCE, "Warm", "Stylish", "Cozy", "Lively", "Romantic", "Social", "Charming");
    const bar = { entityId: "e-bar", name: "Attaboy", share: 30 };
    const tagged = withOverlap(
      { entityId: "e-c", tags: [...tags(CUISINE, "Italian"), ...moody], category: "eat" },
      [bar, { entityId: "e-via", name: "Via Carota", share: 20 }],
      new Map([
        ["e-bar", eat(moody)],
        ["e-via", eat([...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Warm", "Stylish")])],
      ]),
      searchTags([[...tags(CUISINE, "Italian"), ...moody], []]),
    );
    expect(likeDriver(tagged)?.name).toBe("Via Carota");
  });

  it("takes the bigger share on a tie", () => {
    const tied = new Map([
      ["e-via", eat(via)],
      ["e-lilia", eat(via)],
    ]);
    expect(likeDriver(withOverlap(candidate, drivers, tied, search))?.name).toBe("Lilia");
  });

  it("gives no line under two shared tags", () => {
    const tagged = withOverlap(candidate, drivers, new Map([["e-via", eat(tags(CUISINE, "Italian"))]]), search);
    expect(tagged.some((d) => d.tags)).toBe(false);
    expect(likeLine(tagged)).toBeNull();
  });

  it("gives no line when the only second tag is an empty word", () => {
    const tagged = withOverlap(candidate, drivers, new Map([["e-via", eat([...tags(CUISINE, "Italian"), tag("Casual")])]]), search);
    expect(likeLine(tagged)).toBeNull();
  });

  it("never makes a plain driver or an artist the favorite, whatever tags it has", () => {
    const everything = new Map([
      ["advisor", eat(via)],
      ["trip-picks", eat(via)],
      ["other", eat(via)],
      ["e-band", eat(via)],
    ]);
    const tagged = withOverlap(
      candidate,
      [
        { entityId: "advisor", name: "Your places", share: 40 },
        { entityId: "trip-picks", name: "This trip's picks", share: 30 },
        { entityId: "other", name: "Other favorites", share: 20 },
        { entityId: "e-band", name: "Khruangbin", share: 10, media: true },
      ],
      everything,
      search,
    );
    expect(tagged.some((d) => d.tags)).toBe(false);
  });

  it("never reads a plain row as the favorite, even with tags on it", () => {
    const plain = [{ entityId: "trip-picks", name: "This trip's picks", share: 100, tags: ["Warm", "Cozy"] }];
    expect(likeDriver(plain)).toBeUndefined();
    expect(likeLine(plain)).toBeNull();
  });

  it("never says a favorite is like itself", () => {
    const tagged = withOverlap({ entityId: "e-via", tags: via, category: "eat" }, drivers, favorites, search);
    expect(likeDriver(tagged)?.name).toBe("Lilia");
    expect(likeLine(withOverlap({ entityId: "e-via", tags: via, category: "eat" }, drivers.slice(1), favorites, search))).toBeNull();
  });

  it("skips a favorite with no share of this match", () => {
    const tagged = withOverlap(candidate, [{ entityId: "e-via", name: "Via Carota", share: 0 }], favorites, search);
    expect(likeLine(tagged)).toBeNull();
  });

  it("keeps Like to one kind of place, and claims only the feel across kinds", () => {
    const bar = { entityId: "e-bar", name: "Attaboy", share: 30 };
    const moods = tags(AMBIENCE, "Intimate", "Romantic", "Stylish");
    const hotel = { entityId: "e-h", tags: moods, category: "stay" as const };
    const atBar = new Map([["e-bar", { tags: moods, category: "drink" as const }]]);
    const tagged = withOverlap(hotel, [bar], atBar, searchTags([moods, []]));
    expect(likeLine(tagged)).toBe("Same intimate, romantic, stylish feel as Attaboy");
    expect(likeLine(withOverlap({ ...hotel, category: "drink" }, [bar], atBar, searchTags([moods, []])))).toBe(
      "Like Attaboy: intimate, romantic, stylish",
    );
  });

  it("prefers a favorite of the same kind over a closer one of another kind", () => {
    const moods = tags(AMBIENCE, "Intimate", "Romantic", "Stylish", "Cozy");
    const steakhouse = { entityId: "e-s", tags: moods, category: "eat" as const };
    const tagged = withOverlap(
      steakhouse,
      [
        { entityId: "e-bar", name: "Attaboy", share: 30 },
        { entityId: "e-via", name: "Via Carota", share: 20 },
      ],
      new Map([
        ["e-bar", { tags: moods, category: "drink" as const }],
        ["e-via", eat(tags(AMBIENCE, "Intimate", "Cozy"))],
      ]),
      searchTags([moods, []]),
    );
    expect(likeDriver(tagged)?.name).toBe("Via Carota");
  });

  it("does not share cuisine across kinds of place", () => {
    const candidate = [...tags(CUISINE, "Italian", "Seafood"), tag("Warm")];
    const tagged = withOverlap(
      { entityId: "e-c", tags: candidate, category: "stay" },
      [{ entityId: "e-via", name: "Via Carota", share: 20 }],
      new Map([["e-via", eat(candidate)]]),
      searchTags([candidate, []]),
    );
    expect(likeLine(tagged)).toBeNull();
  });

  it("keeps the favorite when another search carries other tags", () => {
    const place = [...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Warm", "Stylish", "Rustic")];
    const pool = new Map([
      ["e-via", eat([...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Warm", "Rustic")])],
      ["e-lilia", eat([...tags(CUISINE, "Italian"), ...tags(AMBIENCE, "Warm", "Stylish")])],
    ]);
    const because = [
      { entityId: "e-lilia", name: "Lilia", share: 26 },
      { entityId: "e-via", name: "Via Carota", share: 25 },
    ];
    const here = { entityId: "e-c", tags: place, category: "eat" as const };
    const first = likeDriver(withOverlap(here, because, pool, searchTags([place, tags(AMBIENCE, "Stylish")])))?.name;
    const second = likeDriver(withOverlap(here, because, pool, searchTags([place, tags(AMBIENCE, "Rustic")])))?.name;
    expect(second).toBe(first);
  });

  it("clears stale tags", () => {
    const stale = drivers.map((d) => (d.entityId === "e-lilia" ? { ...d, tags: ["Warm", "Cozy"] } : d));
    expect(withOverlap(candidate, stale, new Map(), search).some((d) => d.tags)).toBe(false);
  });
});

describe("mediaNotes", () => {
  const band = { entityId: "e-band", name: "Khruangbin", share: 21, media: true };
  const artists = new Set(["e-band"]);
  const others = [
    { entityId: "e-via", name: "Via Carota", share: 20 },
    { entityId: "e-lilia", name: "Lilia", share: 19 },
  ];

  it("names the artist with the review fact that ties them to the place", () => {
    const notes = mediaNotes(
      [{ id: "a", category: "eat", because: [...others, { ...band, share: 15 }], keywords: [{ name: "Live Music", count: 26 }, { name: "steak", count: 40 }] }],
      artists,
    );
    expect(notes.get("a")).toEqual({ name: "Khruangbin", fact: "reviews mention live music" });
  });

  it("does not take a passing mention for a fact, or tie a film to music", () => {
    const keywords = [{ name: "jazz", count: 2 }];
    expect(mediaNotes([{ id: "a", category: "eat", because: [{ ...band, share: 15 }, ...others], keywords }], artists).size).toBe(0);
    const film = { ...band, entityId: "e-film", name: "In the Mood for Love", share: 15 };
    const loud = [{ name: "live music", count: 30 }];
    expect(mediaNotes([{ id: "a", category: "eat", because: [film, ...others], keywords: loud }], artists).size).toBe(0);
  });

  it("without a fact names only the place the artist leads the most", () => {
    const notes = mediaNotes(
      [
        { id: "a", category: "eat", because: [{ ...band, share: 21 }, ...others] },
        { id: "b", category: "eat", because: [{ ...band, share: 24 }, ...others] },
        { id: "c", category: "eat", because: [{ ...others[0]!, share: 30 }, band] },
      ],
      artists,
    );
    expect([...notes.keys()]).toEqual(["b"]);
    expect(notes.get("b")).toEqual({ name: "Khruangbin" });
  });

  it("stops at places a fact ties, and never names a hotel", () => {
    const fact = { id: "a", category: "eat", because: [{ ...band, share: 15 }, ...others], keywords: [{ name: "vinyl", count: 9 }] };
    const lead = { id: "b", category: "eat", because: [{ ...band, share: 30 }, ...others] };
    expect([...mediaNotes([fact, lead], artists).keys()]).toEqual(["a"]);
    expect(mediaNotes([{ ...lead, category: "stay" }], artists).size).toBe(0);
  });
});

describe("likeLine", () => {
  const because = [{ entityId: "e-via", name: "Via Carota", share: 27, tags: ["Italian", "Warm", "Stylish"] }];

  it("drops the last tags to fit, and gives up under two", () => {
    expect(likeLine(because)).toBe("Like Via Carota: Italian, warm, stylish");
    expect(likeLine(because, 30)).toBe("Like Via Carota: Italian, warm");
    expect(likeLine(because, 20)).toBeNull();
  });

  it("is null with one tag or none", () => {
    expect(likeLine([{ ...because[0]!, tags: ["Warm"] }])).toBeNull();
    expect(likeLine([{ ...because[0]!, tags: undefined }])).toBeNull();
    expect(likeLine([])).toBeNull();
  });
});

describe("mediaDriver", () => {
  const band = { entityId: "e-band", name: "Khruangbin", share: 20, media: true };
  const place = (name: string, share: number) => ({ entityId: `e-${name}`, name, share });

  it("finds an artist or film among the top three by share", () => {
    expect(mediaDriver([place("a", 30), place("b", 25), band, place("c", 10)])?.name).toBe("Khruangbin");
    expect(mediaDriver([band, place("a", 30), place("b", 25), place("c", 21)])).toBeUndefined();
  });

  it("does not count plain entries as drivers, and skips no share", () => {
    const plain = { entityId: "other", name: "Other favorites", share: 90 };
    expect(mediaDriver([plain, place("a", 30), place("b", 25), band])?.name).toBe("Khruangbin");
    expect(mediaDriver([{ ...band, share: 0 }])).toBeUndefined();
  });

  it("is undefined without one", () => {
    expect(mediaDriver([place("a", 30)])).toBeUndefined();
  });
});

describe("carryTags", () => {
  it("copies tags by favorite and keeps the target's own shares", () => {
    const target = [
      { entityId: "e-via", name: "Via Carota", share: 40 },
      { entityId: "e-lilia", name: "Lilia", share: 60, tags: ["Stale", "Tags"] },
    ];
    const tagged = [{ entityId: "e-via", name: "Via Carota", share: 27, tags: ["Italian", "Warm"] }];
    expect(carryTags(target, tagged)).toEqual([
      { entityId: "e-via", name: "Via Carota", share: 40, tags: ["Italian", "Warm"] },
      { entityId: "e-lilia", name: "Lilia", share: 60 },
    ]);
  });

  it("leaves the target alone with nothing to carry", () => {
    const target = [{ entityId: "e-via", name: "Via Carota", share: 40 }];
    expect(carryTags(target, undefined)).toBe(target);
  });
});

describe("tagPhrase", () => {
  it("keeps the capitals of peoples and places", () => {
    expect(tagPhrase("Modern portuguese")).toBe("modern Portuguese");
    expect(tagPhrase("Iberian chic")).toBe("Iberian chic");
    expect(tagPhrase("Tex-Mex")).toBe("Tex-Mex");
    expect(tagPhrase("Pan-Asian")).toBe("Pan-Asian");
    expect(tagPhrase("BBQ")).toBe("BBQ");
    expect(tagPhrase("Japanese-inspired")).toBe("Japanese-inspired");
    expect(tagPhrase("Family-friendly")).toBe("family-friendly");
    expect(tagPhrase("Farm to table")).toBe("farm to table");
  });
});
