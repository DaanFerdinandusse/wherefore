import { describe, expect, it } from "vitest";

import { weighedPick } from "./tools/recommend-format";
import { dealScores, defaultVerdicts, mergeVerdicts, parseMore, parseWeighReply, plainLine, settleVerdicts, validateVerdicts, verdictOrder, verdictsSoFar, type WeighPlace } from "./weigh";

const place = (id: string, sharedTags: string[] = ["Cozy", "Italian"], facts: Record<string, unknown> = {}): WeighPlace => ({
  tripPlaceId: id,
  name: id,
  category: "eat",
  sharedTags,
  facts,
});
const answer = (id: string, stand: "pick" | "backup" | "out", good = "Cozy,", rest = "but a brunch place.", isCatch = true) => ({
  place_id: id,
  stand,
  good,
  rest,
  catch: isCatch,
});

describe("validateVerdicts", () => {
  it("keeps the model's line and stand", () => {
    const [verdict] = validateVerdicts([place("a")], [answer("a", "pick", "Italian, cozy and chic.", "Get the cacio e pepe.", false)], []);
    expect(verdict).toEqual({ tripPlaceId: "a", stand: "pick", good: "Italian, cozy and chic.", rest: "Get the cacio e pepe.", catch: false });
  });

  it("leaves exactly one pick and one backup", () => {
    const stands = validateVerdicts([place("a"), place("b"), place("c")], [answer("a", "pick"), answer("b", "pick"), answer("c", "pick")], []).map((v) => v.stand);
    expect(stands).toEqual(["pick", "backup", "out"]);
  });

  it("promotes a place when the model picked none", () => {
    expect(validateVerdicts([place("a"), place("b")], [answer("a", "out"), answer("b", "backup")], []).map((v) => v.stand)).toEqual(["out", "pick"]);
    expect(validateVerdicts([place("a"), place("b")], [answer("a", "out"), answer("b", "out")], [])[0]?.stand).toBe("pick");
  });

  it("gives a skipped place its shared taste, out", () => {
    const verdicts = validateVerdicts([place("a"), place("b")], [answer("a", "pick")], []);
    expect(verdicts[1]).toMatchObject({ stand: "out", good: "Cozy and italian.", rest: "", catch: false });
  });

  it("drops a line that names a favorite: the reason is the person, not another place", () => {
    const [verdict] = validateVerdicts([place("a")], [answer("a", "pick", "Just like Lilia,", "but louder.")], ["Lilia"]);
    expect(verdict?.good).toBe("Cozy and italian.");
    expect(verdict?.catch).toBe(false);
  });

  it("drops a claim about hours or prices no fact says", () => {
    const [verdict] = validateVerdicts([place("a")], [answer("a", "pick", "Cozy,", "and it closes at midnight.")], []);
    expect(verdict?.rest).toBe("");
    expect(verdict?.good).toBe("Cozy.");
  });

  it("keeps a claim that quotes the place's facts", () => {
    const facts = { about: "Book ahead for the terrace" };
    const [verdict] = validateVerdicts([place("a", ["Cozy"], facts)], [answer("a", "pick", "Cozy.", "Book ahead for the terrace.")], []);
    expect(verdict?.rest).toBe("Book ahead for the terrace.");
  });

  it("does not call a plain fact a catch", () => {
    const [verdict] = validateVerdicts([place("a")], [answer("a", "pick", "Cozy Italian,", "in Campo de Ourique.", true)], []);
    expect(verdict?.catch).toBe(false);
  });

  it("closes the sentence before a new one starts", () => {
    const [verdict] = validateVerdicts([place("a")], [answer("a", "pick", "Cozy Italian,", "Get the carbonara.")], []);
    expect(`${verdict?.good} ${verdict?.rest}`).toBe("Cozy Italian. Get the carbonara.");
  });

  it("never leaves the pick on a bare word when its line is cut short", () => {
    const facts = { review_keywords: ["Carbonara", "Burrata", "Patio"] };
    const [verdict] = validateVerdicts([place("a", ["Cozy"], facts)], [answer("a", "pick", "Intimate,", "and it closes at midnight.")], []);
    expect(`${verdict?.good} ${verdict?.rest}`).toBe("Intimate. Reviews talk about carbonara and burrata.");
  });

  it("does the same for a place promoted to pick", () => {
    const [verdict] = validateVerdicts([place("a", ["Cozy"], { review_keywords: ["Carbonara"] })], [], []);
    expect(verdict?.stand).toBe("pick");
    expect(verdict?.rest).toBe("Reviews talk about carbonara.");
  });

  it("leaves a rejected place as it is", () => {
    const [, verdict] = validateVerdicts([place("a"), place("b", ["Cozy"], { review_keywords: ["Carbonara"] })], [answer("a", "pick"), answer("b", "out", "Cozy.", "")], []);
    expect(verdict?.rest).toBe("");
  });

  it("removes dashes", () => {
    const [verdict] = validateVerdicts([place("a")], [answer("a", "pick", "Cozy \u2014 and chic.", "Good \u2013 really.")], []);
    expect(`${verdict?.good} ${verdict?.rest}`).not.toMatch(/[\u2014\u2013]/);
  });
});

describe("defaultVerdicts", () => {
  it("picks the search's first place on the shared taste alone", () => {
    expect(defaultVerdicts([place("a"), place("b")]).map((v) => v.stand)).toEqual(["pick", "out"]);
  });

  it("says nothing it does not know", () => {
    expect(plainLine({ sharedTags: [] })).toEqual({ good: "A taste match.", rest: "" });
  });
});

describe("mergeVerdicts", () => {
  const first = [
    { tripPlaceId: "a", stand: "pick" as const, good: "A.", rest: "", catch: false },
    { tripPlaceId: "b", stand: "out" as const, good: "B,", rest: "but no.", catch: true },
  ];

  it("keeps the pick and takes the new best as backup", () => {
    const merged = mergeVerdicts(first, [{ tripPlaceId: "c", stand: "pick", good: "C.", rest: "", catch: false }], { keepPick: true });
    expect(merged.map((v) => [v.tripPlaceId, v.stand])).toEqual([["a", "pick"], ["b", "out"], ["c", "backup"]]);
  });

  it("moves the old pick to backup when the agent changes its mind", () => {
    const merged = mergeVerdicts(first, [{ tripPlaceId: "c", stand: "pick", good: "C.", rest: "", catch: false }], { keepPick: false });
    expect(merged.map((v) => [v.tripPlaceId, v.stand])).toEqual([["a", "backup"], ["b", "out"], ["c", "pick"]]);
  });

  it("never leaves two backups", () => {
    const withBackup = [...first, { tripPlaceId: "z", stand: "backup" as const, good: "Z.", rest: "", catch: false }];
    const merged = mergeVerdicts(withBackup, [{ tripPlaceId: "c", stand: "backup", good: "C.", rest: "", catch: false }], { keepPick: true });
    expect(merged.filter((v) => v.stand === "backup").map((v) => v.tripPlaceId)).toEqual(["z"]);
  });
});

describe("verdictOrder", () => {
  it("puts the pick first, the backup next and the rejected at the back", () => {
    const items = ["a", "b", "c", "d"].map((tripPlaceId) => ({ tripPlaceId }));
    const verdicts = [
      { tripPlaceId: "a", stand: "out" as const, good: "", rest: "", catch: false },
      { tripPlaceId: "c", stand: "pick" as const, good: "", rest: "", catch: false },
      { tripPlaceId: "d", stand: "backup" as const, good: "", rest: "", catch: false },
    ];
    expect(verdictOrder(items, verdicts).map((i) => i.tripPlaceId)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("dealScores", () => {
  const scores = (list: { score: number | null }[]) => dealScores(list).map((item) => item.score);

  it("gives the pick the top score when it beat a higher one", () => {
    expect(scores([{ score: 68 }, { score: 94 }, { score: 85 }])).toEqual([94, 85, 68]);
  });

  it("changes nothing when the agent agrees with the order", () => {
    expect(scores([{ score: 94 }, { score: 77 }])).toEqual([94, 77]);
  });

  it("never ties the pick and the backup across two searches", () => {
    expect(scores([{ score: 94 }, { score: 94 }, { score: 87 }])).toEqual([94, 93, 87]);
  });

  it("leaves a place with no score unscored", () => {
    expect(scores([{ score: null }, { score: 60 }, { score: 90 }])).toEqual([null, 90, 60]);
  });
});

describe("parseWeighReply", () => {
  it("reads an answer in a code fence and skips bad entries", () => {
    const reply = '```json\n{"verdicts":[{"place_id":"a","stand":"pick","good":"Cozy.","rest":""},{"stand":"out"}],"search_again":null}\n```';
    const parsed = parseWeighReply(reply);
    expect(parsed.verdicts.map((v) => v.place_id)).toEqual(["a"]);
    expect(parsed.more).toBeUndefined();
  });

  it("returns nothing for prose", () => {
    expect(parseWeighReply("I would go with the second one.").verdicts).toEqual([]);
  });
});

describe("parseMore", () => {
  it("reads a request for one more search", () => {
    expect(parseMore({ why: "Only one real fit. Looking for more Italian.", intent: "italian restaurants", tags: ["italian"], less_known: false })).toEqual({
      why: "Only one real fit. Looking for more Italian",
      intent: "italian restaurants",
      tags: ["italian"],
      lessKnown: false,
    });
  });

  it("needs an intent", () => {
    expect(parseMore({ why: "More", intent: "  ", tags: [] })).toBeUndefined();
    expect(parseMore(null)).toBeUndefined();
  });

  it("falls back when the status line runs long", () => {
    expect(parseMore({ why: "x".repeat(90), intent: "italian", tags: [] })?.why).toBe("Looking for more: italian");
  });
});

describe("weighedPick", () => {
  it("reads the pick an ask's weighing made", () => {
    expect(weighedPick({ verdicts: [{ stand: "out", tripPlaceId: "a" }, { stand: "pick", tripPlaceId: "b" }] })).toBe("b");
  });

  it("is empty for an ask nobody weighed", () => {
    expect(weighedPick({})).toBeUndefined();
    expect(weighedPick(null)).toBeUndefined();
    expect(weighedPick({ verdicts: "no" })).toBeUndefined();
  });
});

describe("verdictsSoFar", () => {
  const whole = '{"place_id":"a","stand":"pick","good":"Cozy,","rest":"this is \\"Ana\\". {really}","catch":false}';

  it("reads the verdicts that are complete, and leaves the one still being written", () => {
    const reply = `{"verdicts":[${whole},{"place_id":"b","stand":"out","good":"Co`;
    expect(verdictsSoFar(reply).map((v) => v.place_id)).toEqual(["a"]);
  });

  it("is not fooled by braces and quotes inside a line", () => {
    expect(verdictsSoFar(`{"verdicts":[${whole}]`)[0]?.rest).toBe('this is "Ana". {really}');
  });

  it("finds nothing before the array starts", () => {
    expect(verdictsSoFar('{"verd')).toEqual([]);
  });

  it("stops at the end of the array", () => {
    expect(verdictsSoFar(`{"verdicts":[${whole}],"search_again":{"why":"x","intent":"y"}}`)).toHaveLength(1);
  });
});

describe("settleVerdicts", () => {
  const verdict = (tripPlaceId: string, stand: "pick" | "backup" | "out") => ({ tripPlaceId, stand, good: "", rest: "", catch: false });

  it("keeps the order things were said in, with the final stands", () => {
    const settled = settleVerdicts([verdict("b", "pick"), verdict("a", "pick")], [verdict("a", "pick"), verdict("b", "backup")]);
    expect(settled.map((v) => [v.tripPlaceId, v.stand])).toEqual([["b", "backup"], ["a", "pick"]]);
  });

  it("adds a place the model skipped", () => {
    expect(settleVerdicts([verdict("a", "pick")], [verdict("a", "pick"), verdict("b", "out")]).map((v) => v.tripPlaceId)).toEqual(["a", "b"]);
  });
});
