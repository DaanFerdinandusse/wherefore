import { describe, expect, it } from "vitest";

import type { AppUIMessage, TripPlaceCard } from "@/lib/contracts";

import { toolErrorText } from "./chat-errors";
import { placesMetaOf, toolPlaceEvents } from "./chat-places";
import { composerPlaceholder, liveRecommendationId, mainNeighborhood, picksByAsk, placesByMatch, recommendationByPlace } from "./chat-format";

const card = (id: string, extra: Partial<TripPlaceCard> = {}): TripPlaceCard => ({
  tripPlaceId: id,
  placeId: `p-${id}`,
  entityId: `e-${id}`,
  name: `Place ${id}`,
  category: "eat",
  because: [],
  sharedTags: [],
  status: "suggested",
  source: "ask",
  askIds: ["ask-1"],
  ...extra,
});

describe("search result order", () => {
  it("orders by the displayed match without mutating tool output or changing ties", () => {
    const places = [card("contramar", { score: 77, yourPlace: { advisorPlaceId: "advisor-1", note: "" } }), card("malix", { score: 69 }), card("forte", { score: 77 }), card("cicatriz", { score: 69 }), card("maizajo", { score: 60 })];
    expect(placesByMatch(places).map((place) => place.tripPlaceId)).toEqual(["contramar", "forte", "malix", "cicatriz", "maizajo"]);
    expect(places[1].tripPlaceId).toBe("malix");
  });

  it("keeps unscored streaming results after scored results, including zero", () => {
    const places = [card("pending-1"), card("zero", { score: 0 }), card("pending-2"), card("match", { score: 77 })];
    expect(placesByMatch(places).map((place) => place.tripPlaceId)).toEqual(["match", "zero", "pending-1", "pending-2"]);
    expect(placesByMatch([])).toEqual([]);
  });
});

function recommend(toolCallId: string, tripPlaceId: string, askId = "ask-1"): AppUIMessage {
  return {
    id: `m-${toolCallId}`,
    role: "assistant",
    parts: [
      {
        type: "tool-recommend_place",
        toolCallId,
        state: "output-available",
        input: { place_id: tripPlaceId },
        output: { card: card(tripPlaceId), askId, target: { day: 1, slot: "dinner", label: "Fri dinner", date: "2027-05-14" } },
      },
    ],
  };
}

describe("recommendations in the thread", () => {
  const messages = [recommend("call-1", "tp-1"), { id: "u", role: "user" as const, parts: [{ type: "text" as const, text: "Good" }] }, recommend("call-2", "tp-2", "ask-2")];

  it("shows only the latest as the full card", () => {
    expect(liveRecommendationId(messages)).toBe("call-2");
    expect(liveRecommendationId([])).toBeUndefined();
  });

  it("keeps each place's recommendation and each ask's pick", () => {
    expect(recommendationByPlace(messages).get("tp-1")?.target?.label).toBe("Fri dinner");
    expect(picksByAsk(messages)).toEqual(new Map([["ask-1", "tp-1"], ["ask-2", "tp-2"]]));
  });

  it("hands the pick and the slot to the workspace", () => {
    const events = toolPlaceEvents(messages);
    expect(events).toHaveLength(2);
    expect(placesMetaOf(events[0]!)).toEqual({
      toolCallId: "call-1",
      phase: "done",
      askId: "ask-1",
      target: { day: 1, slot: "dinner" },
      pickTripPlaceId: "tp-1",
    });
  });
});

describe("tool errors in plain words", () => {
  it("keeps advisor-facing errors and hides internal ones", () => {
    expect(toolErrorText("Try the search again in a moment.")).toBe("Try the search again in a moment.");
    expect(toolErrorText('AI_InvalidToolInputError: Invalid input for tool find_places: {"take":5}')).toBe(
      "The search request was not valid, so nothing was looked up.",
    );
    expect(toolErrorText("Interrupted", "pick")).toBe("The pick was interrupted.");
    expect(toolErrorText(undefined)).toBe("The search did not finish.");
  });
});

describe("composer placeholder", () => {
  const base = { clientName: "Ana Ruiz", destination: "Lisbon" };
  it("asks for the brief in an empty chat", () => {
    expect(composerPlaceholder({ ...base, empty: true, busy: false })).toBe("Tell me what Ana wants from Lisbon");
  });
  it("offers a change while a turn runs", () => {
    expect(composerPlaceholder({ ...base, empty: false, busy: true })).toBe("Ask for a change while I search, or stop");
  });
  it("names the trip's own neighborhood", () => {
    expect(composerPlaceholder({ ...base, empty: false, busy: false, neighborhood: "Condesa" })).toBe(
      "Ask for a change, like “a quieter lunch” or “more coffee near Condesa”",
    );
  });

  it("picks the neighborhood of the itinerary first", () => {
    const places = [card("a", { neighborhood: "Chiado" }), card("b", { neighborhood: "Chiado" }), card("c", { neighborhood: "Alfama" })];
    expect(mainNeighborhood(places, [])).toBe("Chiado");
    expect(mainNeighborhood(places, [{ id: "s", day: 1, slot: "dinner", tripPlaceId: "c", note: "", position: 0 }])).toBe("Alfama");
    expect(mainNeighborhood([], [])).toBeUndefined();
  });
});
