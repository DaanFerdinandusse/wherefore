"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { applySlotWrites, swapWrites, writtenNoteSource } from "@/components/trip/workspace/reducer";
import { InvalidInputError, isAppError, NotFoundError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import type { Ask, ItinerarySlot, TripPlaceStatus } from "@/lib/contracts";
import { db } from "@/lib/db";
import { itinerarySlots } from "@/lib/db/schema";
import { getAdvisorPlaceForPlace, removeAdvisorPlace, saveAdvisorPlace, updateAdvisorPlaceNote } from "@/lib/places";

import type { SetSlotsResult } from "./contracts";
import { toSlot } from "./map";
import { archiveAsk, clearSlot, setSlots, setTripPlaceStatus, upsertSlot, upsertTripPlaces } from "./mutations";
import { getTrip, listTripCalls, listTripPlaceCards } from "./queries";

// Server actions for the trip workspace: the board's +, "Not for", the ask
// tab ×, the rail's drop and clear, the itinerary view's reorder and notes.
// Each starts with requireUser() and validates its input with Zod. They
// return a result instead of throwing so the client can roll back its
// optimistic update and say what went wrong. Sharing has its own route
// (/api/trips/[tripId]/share) behind the ShareButton.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const slotName = z.enum(["morning", "lunch", "afternoon", "dinner", "night", "stay"]);
const position = z.number().int().min(0).max(20);
const slotInput = z.object({
  day: z.number().int().min(1).max(60),
  slot: slotName,
  position: position.optional(),
  tripPlaceId: id.nullable().optional(),
  note: z.string().max(2000).optional(),
  /** Show the note on the traveler view. Left out next to a note: the row's flag is kept. */
  noteForTraveler: z.boolean().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
const slotRef = z.object({ day: z.number().int().min(1).max(60), slot: slotName, position: position.optional() });

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: "That change is not valid. Reload and try again." };
    if (isAppError(error)) return { ok: false, error: error.message };
    console.error("workspace action failed", error);
    return { ok: false, error: "Could not save that change. Try again." };
  }
}

/** The trip's stored slot rows. The caller has checked the trip is in scope. */
async function tripSlots(tripId: string): Promise<ItinerarySlot[]> {
  const rows = await db.select().from(itinerarySlots).where(eq(itinerarySlots.tripId, tripId));
  return rows.map(toSlot);
}

/**
 * Puts a place in one slot (or writes a slot's note). A note written without
 * the traveler flag keeps the stored row's flag, so an edit that did not say
 * so never unpublishes a note the traveler sees. An agent note stays the
 * agent's (and off the traveler view) until the advisor rewrites its text.
 */
export async function saveSlotAction(tripId: string, input: z.input<typeof slotInput>): Promise<ActionResult<ItinerarySlot>> {
  return run(async () => {
    const user = await requireUser();
    const trip = id.parse(tripId);
    const parsed = slotInput.parse(input);
    if (parsed.note === undefined) return upsertSlot(trip, parsed, user);
    if (!(await getTrip(trip, user))) throw new NotFoundError("trip");
    const [row] = await db
      .select({ note: itinerarySlots.note, noteForTraveler: itinerarySlots.noteForTraveler, noteSource: itinerarySlots.noteSource })
      .from(itinerarySlots)
      .where(
        and(
          eq(itinerarySlots.tripId, trip),
          eq(itinerarySlots.day, parsed.day),
          eq(itinerarySlots.slot, parsed.slot),
          eq(itinerarySlots.position, parsed.position ?? 0),
        ),
      )
      .limit(1);
    const stored = row ? { note: row.note, noteSource: row.noteSource === "agent" ? ("agent" as const) : undefined } : undefined;
    const noteSource = writtenNoteSource({ note: parsed.note }, stored);
    const noteForTraveler = noteSource === "agent" ? false : (parsed.noteForTraveler ?? row?.noteForTraveler ?? false);
    return upsertSlot(trip, { ...parsed, noteForTraveler, noteSource }, user);
  });
}

export async function clearSlotAction(slotId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const user = await requireUser();
    await clearSlot(id.parse(slotId), user);
    return null;
  });
}

/**
 * Reorder within a day: swaps (place, note, traveler flag) between two slots
 * exactly, from the stored rows, and writes the itinerary back in one replace
 * so the swap lands whole or not at all. Returns every row (the replace gives
 * them new ids).
 */
export async function swapSlotsAction(
  tripId: string,
  from: z.input<typeof slotRef>,
  to: z.input<typeof slotRef>,
): Promise<ActionResult<SetSlotsResult>> {
  return run(async () => {
    const user = await requireUser();
    const trip = id.parse(tripId);
    const a = slotRef.parse(from);
    const b = slotRef.parse(to);
    if (a.day !== b.day) throw new InvalidInputError("A place moves within its own day.");
    if (!(await getTrip(trip, user))) throw new NotFoundError("trip");
    const rows = await tripSlots(trip);
    const writes = swapWrites(rows, a, b);
    if (writes.length === 0) return { applied: rows, rejected: [] };
    return setSlots(trip, applySlotWrites(rows, writes), "replace", user);
  });
}

export async function setPlaceStatusAction(
  tripPlaceId: string,
  status: TripPlaceStatus,
): Promise<ActionResult<{ tripPlaceId: string; status: TripPlaceStatus }>> {
  return run(async () => {
    const user = await requireUser();
    const parsed = z.enum(["suggested", "added", "removed"]).parse(status);
    const row = await setTripPlaceStatus(id.parse(tripPlaceId), parsed, user);
    return { tripPlaceId: row.id, status: parsed };
  });
}

/** The × on an ask tab: the tab hides, its places stay on the board. */
export async function archiveAskAction(askId: string): Promise<ActionResult<Ask>> {
  return run(async () => {
    const user = await requireUser();
    return archiveAsk(id.parse(askId), user);
  });
}

/**
 * The profile's "In my places" toggle for a place on this trip: saves it to
 * My places (and marks the trip place as the advisor's) or removes it.
 */
export async function toggleMyPlaceAction(
  tripId: string,
  tripPlaceId: string,
  saved: boolean,
): Promise<ActionResult<{ yourPlace: { advisorPlaceId: string; note: string } | null }>> {
  return run(async () => {
    const user = await requireUser();
    const [card] = await listTripPlaceCards(id.parse(tripId), user, { tripPlaceIds: [id.parse(tripPlaceId)] });
    if (!card) throw new NotFoundError("trip place");
    if (saved) {
      const trip = await getTrip(tripId, user);
      const row = await saveAdvisorPlace(user, { placeId: card.placeId, city: trip?.destination.name ?? null });
      await upsertTripPlaces(tripId, [{ placeId: card.placeId, source: card.source, category: card.category, advisorPlaceId: row.id }], user);
      return { yourPlace: { advisorPlaceId: row.id, note: row.note } };
    }
    const row = await getAdvisorPlaceForPlace(user, card.placeId);
    if (row) await removeAdvisorPlace(row.id, user);
    return { yourPlace: null };
  });
}

export async function editMyPlaceNoteAction(
  advisorPlaceId: string,
  note: string,
): Promise<ActionResult<{ advisorPlaceId: string; note: string }>> {
  return run(async () => {
    const user = await requireUser();
    const row = await updateAdvisorPlaceNote(id.parse(advisorPlaceId), z.string().max(2000).parse(note), user);
    return { advisorPlaceId: row.id, note: row.note };
  });
}

/** One row of "How we got this": a recommendation call made for this trip. */
export type TripCallRow = {
  id: string;
  endpoint: string;
  params: Record<string, unknown>;
  count: number;
  ms: number;
  loosened: string[];
  source: string;
  createdAt: string;
};

export async function listTripCallsAction(tripId: string): Promise<ActionResult<TripCallRow[]>> {
  return run(async () => {
    const user = await requireUser();
    const rows = await listTripCalls(id.parse(tripId), user);
    return rows.map((row) => ({
      id: row.id,
      endpoint: row.endpoint,
      params: row.params,
      count: row.count,
      ms: row.ms,
      loosened: row.loosened,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    }));
  });
}
