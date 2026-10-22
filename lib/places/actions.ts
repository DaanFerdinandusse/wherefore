"use server";

// Server actions for My places. Each one starts with requireUser(), checks
// its input with zod (actions are reachable by direct POST), writes through
// lib/places, and refreshes the page so the server component re-reads.
// Failures come back as `{ ok: false, error }` with copy the UI can show;
// anything unexpected still throws.

import { refresh } from "next/cache";
import { z } from "zod";

import { updateAdvisor } from "@/lib/auth/advisor";
import { isAppError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import type { TasteTag } from "@/lib/contracts";
import { getEntities } from "@/lib/qloo";

import {
  restoreAdvisorPlace,
  saveAdvisorPlace,
  takeAdvisorPlace,
  updateAdvisorPlaceNote,
  upsertPlaces,
  type RemovedAdvisorPlace,
} from "./mutations";
import { refreshAdvisorTaste } from "./taste";

export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const NOTE_MAX = 500;

function failure(error: unknown, fallback: string): { ok: false; error: string } {
  if (isAppError(error)) return { ok: false, error: error.message };
  console.error(fallback, error);
  return { ok: false, error: fallback };
}

const saveInput = z.object({
  entityId: z.string().trim().min(1).max(120),
  note: z.string().max(NOTE_MAX * 2).optional(),
  city: z.string().trim().max(80).optional(),
});

/**
 * Save a place picked in "Save a place": fetch its full row by entity id
 * (never trust a row from the browser), cache it, then save it to My places
 * with the note and city.
 */
export async function savePlaceAction(
  input: z.input<typeof saveInput>,
): Promise<ActionResult<{ id: string; name: string; city: string }>> {
  const user = await requireUser();
  const parsed = saveInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pick a place from the search results first." };
  const { entityId, note, city } = parsed.data;
  try {
    const { places } = await getEntities([entityId]);
    const place = places.find((p) => p.entityId === entityId);
    if (!place) return { ok: false, error: "That place could not be loaded. Search for it again." };
    const cityName = city || place.city || "";
    if (!cityName) return { ok: false, error: "Add the city this place is in." };
    const ids = await upsertPlaces([place]);
    const placeId = ids[entityId];
    if (!placeId) return { ok: false, error: "That place could not be saved. Try again." };
    const saved = await saveAdvisorPlace(user, {
      placeId,
      city: cityName,
      note: (note ?? "").trim().slice(0, NOTE_MAX),
    });
    refresh();
    return { ok: true, id: saved.id, name: saved.placeName, city: saved.city };
  } catch (error) {
    return failure(error, "That place could not be saved. Try again.");
  }
}

const noteInput = z.object({ id: z.uuid(), note: z.string().max(NOTE_MAX * 2) });

export async function updateNoteAction(
  input: z.input<typeof noteInput>,
): Promise<ActionResult<{ note: string }>> {
  const user = await requireUser();
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That note could not be saved. Try again." };
  try {
    const row = await updateAdvisorPlaceNote(parsed.data.id, parsed.data.note.slice(0, NOTE_MAX), user);
    refresh();
    return { ok: true, note: row.note };
  } catch (error) {
    return failure(error, "That note could not be saved. Try again.");
  }
}

/** Remove a saved place; the result carries what `undoRemoveAction` needs. */
export async function removePlaceAction(id: string): Promise<ActionResult<{ removed: RemovedAdvisorPlace }>> {
  const user = await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "That place is no longer in your places." };
  try {
    const removed = await takeAdvisorPlace(id, user);
    refresh();
    return { ok: true, removed };
  } catch (error) {
    return failure(error, "That place could not be removed. Try again.");
  }
}

const removedInput = z.object({
  id: z.uuid(),
  placeId: z.uuid(),
  city: z.string().max(80),
  note: z.string().max(NOTE_MAX * 2),
  tags: z.array(z.string().max(80)).max(50),
  savedAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  tripPlaceIds: z.array(z.uuid()).max(500),
});

/** Put a removed place back, with its note, saved date and trip links. */
export async function undoRemoveAction(removed: RemovedAdvisorPlace): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = removedInput.safeParse(removed);
  if (!parsed.success) return { ok: false, error: "That place could not be put back. Save it again." };
  try {
    const row = await restoreAdvisorPlace(parsed.data, user);
    refresh();
    return { ok: true, id: row.id };
  } catch (error) {
    return failure(error, "That place could not be put back. Save it again.");
  }
}

/** Recompute "Your taste" from the advisor's places. */
export async function refreshTasteAction(): Promise<ActionResult<{ tags: TasteTag[]; signalCount: number }>> {
  const user = await requireUser();
  try {
    const { tags, signalCount } = await refreshAdvisorTaste(user);
    return { ok: true, tags, signalCount };
  } catch (error) {
    return failure(error, "Your taste could not be updated right now. Try Refresh in a moment.");
  }
}

/** "Blend my taste into searches": stored on advisors.blend_my_taste. */
export async function setBlendMyTasteAction(on: boolean): Promise<ActionResult<{ blendMyTaste: boolean }>> {
  const user = await requireUser();
  if (typeof on !== "boolean") return { ok: false, error: "That setting could not be saved. Try again." };
  try {
    const row = await updateAdvisor(user.userId, { blendMyTaste: on });
    if (!row) return { ok: false, error: "That setting could not be saved. Try again." };
    return { ok: true, blendMyTaste: row.blendMyTaste };
  } catch (error) {
    return failure(error, "That setting could not be saved. Try again.");
  }
}
