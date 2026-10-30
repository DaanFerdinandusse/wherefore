import "server-only";

import { and, eq } from "drizzle-orm";

import type { RecommendPlaceOutput, SlotName } from "@/lib/contracts";
import { db } from "@/lib/db";
import { tripAsks } from "@/lib/db/schema";
import { updateAsk } from "@/lib/trips";

import { guarded, type TurnRef } from "../writes";

import { slotTarget } from "./labels";
import { matchClientNote, targetOfQuery } from "./recommend-format";
import { cardsInOrder, resolveTripPlaceIds } from "./search-core";
import { firstName, loadToolTrip } from "./trip-data";

// recommend_place (v3): after a small search, the agent names its one pick.
// The chat shows the pick as the full place card (J1); every word on that
// card is rendered in code from the card's facts, so the model chooses the
// place and nothing else. The pick is written on its ask (query.pick, a keyed
// overwrite, turn guarded), so the itinerary can show "suggested in chat" on
// the ask's target slot. The itinerary itself is not touched: the advisor
// adds the place from the card, or asks the agent to (set_itinerary).

export type RecommendPlaceInput = {
  place_id: string;
  ask_id?: string;
  target?: { day: number; slot: SlotName };
};

export async function recommendPlaceTool(input: RecommendPlaceInput, turn: TurnRef): Promise<RecommendPlaceOutput> {
  const ctx = await loadToolTrip(turn.tripId);
  const clientFirstName = firstName(ctx.clientName);
  const row = (await resolveTripPlaceIds(turn.tripId, [input.place_id])).get(input.place_id);
  if (!row) return { clientFirstName, error: "That place is not on this trip. Use an id from a search result." };
  if (row.status === "removed") return { clientFirstName, error: "That place was taken off the trip. Pick another one." };

  const [card] = await cardsInOrder(ctx, [row.id]);
  if (!card) return { clientFirstName, error: "That place could not be read back. Search again." };

  // The ask: the one named, if the place is in it; else the place's latest ask.
  const askId = input.ask_id && card.askIds.includes(input.ask_id) ? input.ask_id : card.askIds.at(-1);
  const [ask] = askId
    ? await db
        .select({ id: tripAsks.id, query: tripAsks.query, target: tripAsks.target })
        .from(tripAsks)
        .where(and(eq(tripAsks.id, askId), eq(tripAsks.tripId, turn.tripId)))
        .limit(1)
    : [];

  const rawTarget = input.target ?? ask?.target ?? targetOfQuery(ask?.query) ?? undefined;
  const target = rawTarget
    ? slotTarget(rawTarget, { startDate: ctx.trip.startDate ?? undefined, destinationName: ctx.destination.name })
    : undefined;

  if (ask) {
    const query = { ...ask.query, pick: card.tripPlaceId, ...(rawTarget ? { target: rawTarget } : {}) };
    await guarded(turn, (guard) => updateAsk(ask.id, { query, ...(rawTarget ? { target: rawTarget } : {}) }, ctx.scope, { turn: guard }));
  }

  const terms = [...(card.keywords ?? []), ...(card.dishes ?? []), ...card.sharedTags.map((t) => t.name)];
  const clientNote = matchClientNote(ctx.client?.notes, terms);

  return {
    card,
    clientFirstName,
    ...(ask ? { askId: ask.id } : {}),
    ...(target ? { target } : {}),
    ...(clientNote ? { clientNote } : {}),
  };
}
