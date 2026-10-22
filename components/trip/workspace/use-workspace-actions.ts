"use client";

import { useMemo } from "react";
import { z } from "zod";

import type { SlotName, TripSnapshot } from "@/lib/contracts";
import {
  archiveAskAction,
  clearSlotAction,
  editMyPlaceNoteAction,
  mergeSlotsAction,
  saveSlotAction,
  setPlaceStatusAction,
  shareTripAction,
  toggleMyPlaceAction,
} from "@/lib/trips/workspace-actions";

import { useTripStoreApi } from "../store";

import { firstName, SLOT_LABELS } from "./format";
import { moveWrites, slotAt } from "./reducer";

// The workspace's writes: optimistic in the store first, then the server
// action, then either the server's rows (real slot ids) or a rollback with a
// toast that names the problem. Every caller (board, rail, itinerary view,
// profile) goes through these so the rules live in one place.


export type WorkspaceActions = ReturnType<typeof useWorkspaceActions>;

// Our own route, still checked at the edge: the parts the workspace branches on.
const SnapshotResponse = z.object({
  snapshot: z.looseObject({
    trip: z.looseObject({ id: z.string(), seedStatus: z.enum(["pending", "running", "done", "failed"]) }),
    places: z.array(z.looseObject({ tripPlaceId: z.string() })),
    asks: z.array(z.looseObject({ id: z.string() })),
    slots: z.array(z.looseObject({ id: z.string(), day: z.number() })),
    travelers: z.array(z.unknown()),
  }),
});

export function useWorkspaceActions() {
  const store = useTripStoreApi();

  return useMemo(() => {
    const tripId = () => store.getState().trip.id;
    const fail = (rollback: () => void, error: string) => {
      rollback();
      store.getState().showToast(error);
    };

    async function addToSlot(tripPlaceId: string, day: number, slot: SlotName) {
      const state = store.getState();
      const name = state.places[tripPlaceId]?.name ?? "The place";
      const rollback = state.optimisticSlot({ day, slot, tripPlaceId });
      const result = await saveSlotAction(tripId(), { day, slot, tripPlaceId });
      if (!result.ok) return fail(rollback, result.error);
      store.getState().dispatch({ type: "slotsSaved", slots: [result.data] });
      store.getState().showToast(`${name} added to Day ${day} ${SLOT_LABELS[slot].toLowerCase()}`);
    }

    async function clearSlotAt(day: number, slot: SlotName) {
      const state = store.getState();
      const row = slotAt(state.slots, day, slot);
      if (!row) return;
      const rollback = state.optimisticSlot({ day, slot, tripPlaceId: null });
      // A row still on its temporary id is cleared by writing it empty.
      const result = row.id.startsWith("optimistic:")
        ? await saveSlotAction(tripId(), { day, slot, tripPlaceId: null })
        : await clearSlotAction(row.id);
      if (!result.ok) fail(rollback, result.error);
    }

    async function saveNote(day: number, slot: SlotName, note: string) {
      const state = store.getState();
      const row = slotAt(state.slots, day, slot);
      if ((row?.note ?? "") === note) return;
      const tripPlaceId = row?.tripPlaceId ?? null;
      const rollback = state.optimisticSlot({ day, slot, tripPlaceId, note });
      const result = await saveSlotAction(tripId(), { day, slot, tripPlaceId, note });
      if (!result.ok) return fail(rollback, result.error);
      store.getState().dispatch({ type: "slotsSaved", slots: [result.data] });
    }

    async function moveWithinDay(from: { day: number; slot: SlotName }, to: { day: number; slot: SlotName }) {
      const state = store.getState();
      const writes = moveWrites(state.slots, from, to);
      if (writes.length === 0) return;
      const rollback = state.optimisticSlot(writes);
      const result = await mergeSlotsAction(tripId(), writes);
      if (!result.ok) return fail(rollback, result.error);
      if (result.data.rejected.length > 0) return fail(rollback, result.data.rejected[0].reason);
      store.getState().dispatch({ type: "slotsSaved", slots: result.data.applied });
    }

    async function setStatus(tripPlaceId: string, status: "suggested" | "removed") {
      const rollback = store.getState().optimisticStatus(tripPlaceId, status);
      const result = await setPlaceStatusAction(tripPlaceId, status);
      if (!result.ok) fail(rollback, result.error);
      return result.ok;
    }

    async function removePlace(tripPlaceId: string) {
      const state = store.getState();
      const name = state.places[tripPlaceId]?.name ?? "The place";
      const ok = await setStatus(tripPlaceId, "removed");
      if (ok) store.getState().showToast(`${name} is off the list for ${firstName(state.trip.clientName)}`);
    }

    async function restorePlace(tripPlaceId: string) {
      await setStatus(tripPlaceId, "suggested");
    }

    async function archiveAsk(askId: string) {
      const rollback = store.getState().removeAskTab(askId);
      const result = await archiveAskAction(askId);
      if (!result.ok) fail(rollback, result.error);
    }

    async function toggleMyPlace(tripPlaceId: string, saved: boolean) {
      const state = store.getState();
      const before = state.places[tripPlaceId]?.yourPlace;
      const result = await toggleMyPlaceAction(tripId(), tripPlaceId, saved);
      if (!result.ok) {
        state.dispatch({ type: "placePatch", tripPlaceId, patch: { yourPlace: before } });
        store.getState().showToast(result.error);
        return;
      }
      store.getState().dispatch({ type: "placePatch", tripPlaceId, patch: { yourPlace: result.data.yourPlace ?? undefined } });
      store.getState().showToast(saved ? "Saved to My places" : "Removed from My places");
    }

    async function editMyPlaceNote(advisorPlaceId: string, note: string) {
      const result = await editMyPlaceNoteAction(advisorPlaceId, note);
      if (!result.ok) return store.getState().showToast(result.error);
      const state = store.getState();
      for (const card of Object.values(state.places)) {
        if (card.yourPlace?.advisorPlaceId === advisorPlaceId) {
          state.dispatch({ type: "placePatch", tripPlaceId: card.tripPlaceId, patch: { yourPlace: { advisorPlaceId, note: result.data.note } } });
        }
      }
    }

    async function share(): Promise<string | null> {
      const result = await shareTripAction(tripId());
      if (!result.ok) {
        store.getState().showToast(result.error);
        return null;
      }
      store.getState().setShareToken(result.data.token);
      try {
        await navigator.clipboard.writeText(result.data.url);
        store.getState().showToast("Link copied");
      } catch {
        store.getState().showToast(`Share link: ${result.data.url}`);
      }
      return result.data.url;
    }

    /**
     * Loads the snapshot and applies it. `keepSeeding` reads a "failed" seed
     * as still pending: the answer from before a Retry reached the server.
     */
    async function refetchSnapshot({ keepSeeding = false } = {}): Promise<TripSnapshot | null> {
      const response = await fetch(`/api/trips/${tripId()}/snapshot`, { cache: "no-store" });
      if (!response.ok) return null;
      const parsed = SnapshotResponse.safeParse(await response.json());
      if (!parsed.success) return null;
      let snapshot = parsed.data.snapshot as TripSnapshot;
      if (keepSeeding && snapshot.trip.seedStatus === "failed") {
        snapshot = { ...snapshot, trip: { ...snapshot.trip, seedStatus: "pending" } };
      }
      store.getState().applySnapshot(snapshot);
      return snapshot;
    }

    return {
      addToSlot,
      clearSlotAt,
      saveNote,
      moveWithinDay,
      removePlace,
      restorePlace,
      archiveAsk,
      toggleMyPlace,
      editMyPlaceNote,
      share,
      refetchSnapshot,
    };
  }, [store]);
}
