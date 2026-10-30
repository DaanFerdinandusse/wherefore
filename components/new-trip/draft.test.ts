import { describe, expect, it } from "vitest";

import {
  canCreate,
  draftReducer,
  initialDraft,
  toCreateTripRequest,
  travelersSummary,
  whenSummary,
  whereSummary,
  type Draft,
  type DraftAction,
  type DraftClient,
} from "./draft";
import { createTripRequestSchema } from "./request";

const ana: DraftClient = {
  id: "8d1f4c5e-1b2a-4c3d-9e8f-7a6b5c4d3e2f",
  name: "Ana Ruiz",
  homeCity: "New York",
  avatarUrl: null,
  favoritesCount: 6,
};
const lisbon = { name: "Lisboa", disambiguation: "City, Portugal", countryCode: "PT", lat: 38.72, lon: -9.14, radiusM: 12000 };

function apply(draft: Draft, ...actions: DraftAction[]): Draft {
  return actions.reduce(draftReducer, draft);
}

describe("draftReducer", () => {
  it("enables Create trip once who and where are set", () => {
    const draft = initialDraft();
    expect(canCreate(draft)).toBe(false);
    const withWho = apply(draft, { type: "setClient", client: ana });
    expect(canCreate(withWho)).toBe(false);
    expect(canCreate(apply(withWho, { type: "setDestination", destination: lisbon }))).toBe(true);
  });

  it("counts adults from the travelers until the advisor sets them", () => {
    const draft = apply(
      initialDraft(ana),
      { type: "addGuest", guest: { key: "g1", name: "Clara", clientId: null, favoritesCount: 0 } },
      { type: "addGuest", guest: { key: "g2", name: "Tom", clientId: null, favoritesCount: 0 } },
    );
    expect(draft.adults).toBe(3);
    const touched = apply(draft, { type: "setAdults", value: 2 }, { type: "removeGuest", key: "g2" });
    expect(touched.adults).toBe(2);
    expect(touched.guests.map((g) => g.name)).toEqual(["Clara"]);
  });

  it("ignores empty names and the client added as a guest", () => {
    const draft = apply(
      initialDraft(ana),
      { type: "addGuest", guest: { key: "g1", name: "  ", clientId: null, favoritesCount: 0 } },
      { type: "addGuest", guest: { key: "g2", name: "Ana Ruiz", clientId: ana.id, favoritesCount: 6 } },
    );
    expect(draft.guests).toEqual([]);
  });

  it("summarizes travelers and dates for the bar", () => {
    const one = initialDraft(ana);
    expect(travelersSummary(one)).toBe("Ana");
    const two = apply(one, { type: "addGuest", guest: { key: "g", name: "Clara", clientId: null, favoritesCount: 0 } });
    expect(travelersSummary(two)).toBe("Ana and Clara");
    const three = apply(two, { type: "addGuest", guest: { key: "h", name: "Tom", clientId: null, favoritesCount: 0 } });
    expect(travelersSummary(three)).toBe("Ana and 2 more");

    expect(whenSummary(one)).toBeNull();
    expect(whenSummary(apply(one, { type: "setRange", range: { start: "2027-05-14", end: "2027-05-18" } }))).toBe(
      "14 to 18 May",
    );
    expect(whenSummary(apply(one, { type: "setDatesMode", mode: "unset" }))).toBe("Not set yet");
  });

  it("names the destination with its country", () => {
    const one = initialDraft(ana);
    expect(whereSummary(one)).toBeNull();
    expect(whereSummary(apply(one, { type: "setDestination", destination: lisbon }))).toBe(
      "Lisboa, Portugal",
    );
  });
});

describe("toCreateTripRequest", () => {
  const base = apply(
    initialDraft(ana),
    { type: "setDestination", destination: lisbon },
    { type: "addGuest", guest: { key: "g", name: "Clara", clientId: null, favoritesCount: 0 } },
  );

  it("builds a valid body with exact dates and the companion", () => {
    const body = toCreateTripRequest(apply(base, { type: "setRange", range: { start: "2027-05-14", end: "2027-05-18" } }));
    expect(body).toMatchObject({
      clientId: ana.id,
      datesMode: "exact",
      startDate: "2027-05-14",
      endDate: "2027-05-18",
      adults: 2,
      guests: [{ name: "Clara", clientId: null }],
    });
    expect(createTripRequestSchema.safeParse(body).success).toBe(true);
  });

  it("sends Not set yet without dates and a one day trip for a single day", () => {
    expect(toCreateTripRequest(base)).toMatchObject({ datesMode: "unset", startDate: null, endDate: null });
    expect(toCreateTripRequest(apply(base, { type: "setRange", range: { start: "2027-05-14" } }))).toMatchObject({
      datesMode: "exact",
      startDate: "2027-05-14",
      endDate: "2027-05-14",
    });
  });

  it("returns null until who and where are set", () => {
    expect(toCreateTripRequest(initialDraft(ana))).toBeNull();
  });
});

describe("createTripRequestSchema", () => {
  const valid = {
    clientId: ana.id,
    destination: lisbon,
    datesMode: "exact",
    startDate: "2027-05-14",
    endDate: "2027-05-18",
    adults: 2,
    children: 0,
    guests: [],
  };
  it("rejects exact dates without an end and an end before the start", () => {
    expect(createTripRequestSchema.safeParse({ ...valid, endDate: null }).success).toBe(false);
    expect(createTripRequestSchema.safeParse({ ...valid, endDate: "2027-05-10" }).success).toBe(false);
  });
  it("rejects a client id that is not a uuid and zero adults", () => {
    expect(createTripRequestSchema.safeParse({ ...valid, clientId: "ana" }).success).toBe(false);
    expect(createTripRequestSchema.safeParse({ ...valid, adults: 0 }).success).toBe(false);
  });
});
