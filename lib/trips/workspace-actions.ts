"use server";

import { z } from "zod";

import { isAppError, NotFoundError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import type { Ask, ItinerarySlot, TripPlaceStatus } from "@/lib/contracts";
import { env } from "@/lib/env";

import type { SetSlotsResult } from "./contracts";
import { getAdvisorPlaceForPlace, removeAdvisorPlace, saveAdvisorPlace, updateAdvisorPlaceNote } from "@/lib/places";

import { archiveAsk, clearSlot, setShareToken, setSlots, setTripPlaceStatus, upsertSlot, upsertTripPlaces } from "./mutations";
import { getTrip, listTripCalls, listTripPlaceCards } from "./queries";

// Server actions for the trip workspace: the board's +, "Not for", the ask
// tab ×, the rail's drop and clear, the itinerary view's reorder and notes,
// and Share. Each starts with requireUser() and validates its input with Zod.
// They return a result instead of throwing so the client can roll back its
// optimistic update and say what went wrong.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const slotName = z.enum(["morning", "lunch", "afternoon", "dinner", "night", "stay"]);
const slotInput = z.object({
  day: z.number().int().min(1).max(60),
  slot: slotName,
  position: z.number().int().min(0).max(20).optional(),
  tripPlaceId: id.nullable().optional(),
  note: z.string().max(2000).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

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

/** Puts a place in one slot (or writes a slot's note). */
export async function saveSlotAction(tripId: string, input: z.input<typeof slotInput>): Promise<ActionResult<ItinerarySlot>> {
  return run(async () => {
    const user = await requireUser();
    return upsertSlot(id.parse(tripId), slotInput.parse(input), user);
  });
}

export async function clearSlotAction(slotId: string): Promise<ActionResult<null>> {
  return run(async () => {
    const user = await requireUser();
    await clearSlot(id.parse(slotId), user);
    return null;
  });
}

/** Several slots at once in merge mode: the itinerary view's drag to reorder. */
export async function mergeSlotsAction(
  tripId: string,
  inputs: z.input<typeof slotInput>[],
): Promise<ActionResult<SetSlotsResult>> {
  return run(async () => {
    const user = await requireUser();
    return setSlots(id.parse(tripId), z.array(slotInput).max(40).parse(inputs), "merge", user);
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

/** Creates the share link once (calling again keeps the same link). */
export async function shareTripAction(tripId: string): Promise<ActionResult<{ token: string; url: string }>> {
  return run(async () => {
    const user = await requireUser();
    const trip = await setShareToken(id.parse(tripId), user);
    const token = trip.shareToken ?? "";
    const base = env("APP_URL", "http://localhost:3000").replace(/\/+$/, "");
    return { token, url: `${base}/s/${token}` };
  });
}
