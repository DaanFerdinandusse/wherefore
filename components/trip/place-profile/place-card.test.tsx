import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TripPlaceCard, TripSnapshot } from "@/lib/contracts";

import { PlaceCard, type PlaceCardActions } from "./place-card";

// Rendered without photos so next/image stays out of the test.
const card: TripPlaceCard = {
  tripPlaceId: "tp-1",
  placeId: "p-1",
  entityId: "e-1",
  name: "Da Noi",
  category: "eat",
  score: 88,
  because: [
    { entityId: "e-lilia", name: "Lilia", share: 27 },
    { entityId: "e-via", name: "Via Carota", share: 25, tags: ["Italian", "Warm", "Stylish"] },
  ],
  sharedTags: [],
  status: "suggested",
  source: "ask",
  askIds: [],
};
const trip = { clientName: "Ana Ruiz", destination: { name: "Lisbon" } } as TripSnapshot["trip"];
const actions = {} as PlaceCardActions;

describe("the Why box", () => {
  it("says which favorite the place is like", () => {
    const html = renderToStaticMarkup(<PlaceCard card={card} trip={trip} slots={[]} actions={actions} />);
    expect(html).toContain("Like Via Carota: Italian, warm, stylish");
  });

  it("shows no line without a tagged favorite", () => {
    const plain = { ...card, because: card.because.map(({ entityId, name, share }) => ({ entityId, name, share })) };
    const html = renderToStaticMarkup(<PlaceCard card={plain} trip={trip} slots={[]} actions={actions} />);
    expect(html).not.toContain("Like ");
    expect(html).toContain("Why Ana");
  });
});
