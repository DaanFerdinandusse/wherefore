"use client";

import { useMemo } from "react";
import { z } from "zod";

import type { ItinerarySlot, SlotName, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import { removeTripPlaceAction } from "@/lib/trips/profile-actions";
import {
  archiveAskAction,
  clearSlotAction,
  editMyPlaceNoteAction,
  saveSlotAction,
  setPlaceStatusAction,
  swapSlotsAction,
  toggleMyPlaceAction,
} from "@/lib/trips/workspace-actions";

import { useTripStoreApi, type Optimistic } from "../store";

import { firstName, SLOT_LABELS } from "./format";
import { slotAt, slotKey, swapWrites, type SlotRef } from "./reducer";
import { createWriteQueue } from "./write-queue";

// The workspace's writes: optimistic in the store first, then the server
// action, then either the server's rows (real slot ids) or a rollback of
// exactly that write with a toast that names the problem. Slot writes go
// through a per-slot queue: one at a time per slot, in order, and a response
// that a newer write to the same slot has superseded is not applied. Every
// caller (board, rail, itinerary view, profile) goes through these so the
// rules live in one place.

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

const isStoredId = (rowId: string) => !rowId.startsWith("optimistic:");

export function useWorkspaceActions() {
  const store = useTripStoreApi();

  return useMemo(() => {
    const queue = createWriteQueue();
    // The stored row id per slot key, from every answer (also superseded
    // ones), so a queued clear finds the row a write before it created.
    const storedIds = new Map<string, string>();

    const tripId = () => store.getState().trip.id;
    const toast = (message: string) => store.getState().showToast(message);
    const fail = (write: Optimistic, error: string) => {
      write.rollback();
      toast(error);
      return false;
    };

    /** Applies the server's rows, minus the slots a newer write has claimed since. */
    function saveRows(rows: ItinerarySlot[], isCurrent: (key: string) => boolean) {
      for (const row of rows) storedIds.set(slotKey(row), row.id);
      const fresh = rows.filter((row) => isCurrent(slotKey(row)));
      if (fresh.length > 0) store.getState().dispatch({ type: "slotsSaved", slots: fresh });
    }

    /** Puts a place in a slot. Resolves false (after a toast) when the server refused. */
    async function addToSlot(tripPlaceId: string, day: number, slot: SlotName, position = 0): Promise<boolean> {
      const state = store.getState();
      const name = state.places[tripPlaceId]?.name ?? "The place";
      const write = state.optimisticSlot({ day, slot, position, tripPlaceId });
      return queue.run([slotKey({ day, slot, position })], async (isCurrent) => {
        const result = await saveSlotAction(tripId(), { day, slot, position, tripPlaceId });
        if (!result.ok) return fail(write, result.error);
        write.commit();
        saveRows([result.data], isCurrent);
        toast(`${name} added to Day ${day} ${SLOT_LABELS[slot].toLowerCase()}`);
        return true;
      });
    }

    async function clearSlotAt(day: number, slot: SlotName, position = 0): Promise<boolean> {
      const state = store.getState();
      const row = slotAt(state.slots, day, slot, position);
      if (!row) return true;
      const key = slotKey(row);
      const captured = isStoredId(row.id) ? row.id : undefined;
      const write = state.optimisticSlot({ day, slot, position, tripPlaceId: null });
      return queue.run([key], async () => {
        // A write before this one may have made (or, by a reorder, renamed) the row.
        const ids = [...new Set([storedIds.get(key), captured].filter((v): v is string => !!v))];
        if (ids.length === 0) {
          write.commit();
          return true;
        }
        let error = "";
        for (const rowId of ids) {
          const result = await clearSlotAction(rowId);
          if (result.ok) {
            storedIds.delete(key);
            write.commit();
            return true;
          }
          error = result.error;
        }
        return fail(write, error);
      });
    }

    /** Writes a slot's note and whether the traveler sees it. */
    async function saveNote(ref: SlotRef, note: string, noteForTraveler: boolean): Promise<boolean> {
      const state = store.getState();
      const position = ref.position ?? 0;
      const row = slotAt(state.slots, ref.day, ref.slot, position);
      if ((row?.note ?? "") === note && (row?.noteForTraveler ?? false) === noteForTraveler) return true;
      const tripPlaceId = row?.tripPlaceId ?? null;
      const input = { day: ref.day, slot: ref.slot, position, tripPlaceId, note, noteForTraveler };
      const write = state.optimisticSlot(input);
      return queue.run([slotKey(input)], async (isCurrent) => {
        const result = await saveSlotAction(tripId(), input);
        if (!result.ok) return fail(write, result.error);
        write.commit();
        saveRows([result.data], isCurrent);
        return true;
      });
    }

    /**
     * Swaps two slots of a day: place, note and traveler flag move together.
     * The server writes it as one replace, so it waits for every write in
     * flight and holds back the ones after it.
     */
    async function moveWithinDay(from: SlotRef, to: SlotRef): Promise<boolean> {
      const state = store.getState();
      const writes = swapWrites(state.slots, from, to);
      if (writes.length === 0) return false;
      const write = state.optimisticSlot(writes);
      return queue.run(
        writes.map(slotKey),
        async (isCurrent) => {
          const result = await swapSlotsAction(tripId(), from, to);
          if (!result.ok) return fail(write, result.error);
          if (result.data.rejected.length > 0) {
            fail(write, result.data.rejected[0].reason);
            await refetchSnapshot().catch(() => null);
            return false;
          }
          write.commit();
          saveRows(result.data.applied, isCurrent);
          return true;
        },
        { exclusive: true },
      );
    }

    /** Takes the place out of a slot and keeps the slot's note where it is. */
    async function emptySlotKeepNote(ref: SlotRef): Promise<boolean> {
      const state = store.getState();
      const position = ref.position ?? 0;
      const row = slotAt(state.slots, ref.day, ref.slot, position);
      if (!row?.note.trim()) return clearSlotAt(ref.day, ref.slot, position);
      const input = { day: ref.day, slot: ref.slot, position, tripPlaceId: null, note: row.note };
      const write = state.optimisticSlot(input);
      return queue.run([slotKey(input)], async (isCurrent) => {
        const result = await saveSlotAction(tripId(), input);
        if (!result.ok) return fail(write, result.error);
        write.commit();
        saveRows([result.data], isCurrent);
        return true;
      });
    }

    /**
     * Moves a place to another slot. Within a day it is the exact swap of
     * moveWithinDay. Across days the places trade slots (or the source empties)
     * and each slot keeps its own note.
     */
    async function moveToSlot(from: SlotRef, to: SlotRef): Promise<boolean> {
      if (from.day === to.day) return moveWithinDay(from, to);
      const state = store.getState();
      const fromPosition = from.position ?? 0;
      const source = slotAt(state.slots, from.day, from.slot, fromPosition);
      if (!source?.tripPlaceId) return false;
      const target = slotAt(state.slots, to.day, to.slot, to.position ?? 0);
      if (!(await addToSlot(source.tripPlaceId, to.day, to.slot, to.position ?? 0))) return false;
      if (target?.tripPlaceId) return addToSlot(target.tripPlaceId, from.day, from.slot, fromPosition);
      return emptySlotKeepNote(from);
    }

    async function setStatus(tripPlaceId: string, status: "suggested" | "removed"): Promise<boolean> {
      const write = store.getState().optimisticStatus(tripPlaceId, status);
      const result = await setPlaceStatusAction(tripPlaceId, status);
      if (!result.ok) return fail(write, result.error);
      write.commit();
      return true;
    }

    async function removePlace(tripPlaceId: string) {
      const state = store.getState();
      const name = state.places[tripPlaceId]?.name ?? "The place";
      const ok = await setStatus(tripPlaceId, "removed");
      if (ok) toast(`${name} is off the list for ${firstName(state.trip.clientName)}`);
    }

    /**
     * "Remove and replace" from the profile: the server removes the place and
     * finds the next best one. Not optimistic (the sheet shows its spinner);
     * throws so the sheet can say it did not work.
     */
    async function replacePlace(tripPlaceId: string): Promise<void> {
      const state = store.getState();
      const name = state.places[tripPlaceId]?.name ?? "The place";
      let replacement: TripPlaceCard | null;
      try {
        ({ replacement } = await removeTripPlaceAction(tripId(), tripPlaceId, true));
      } catch {
        throw new Error("The place was not removed. Try again.");
      }
      const { dispatch } = store.getState();
      dispatch({ type: "status", tripPlaceId, status: "removed" });
      if (replacement) {
        dispatch({ type: "upsertPlace", card: replacement });
        toast(`Replaced with ${replacement.name}`);
      } else {
        toast(`${name} is off the list for ${firstName(state.trip.clientName)}. Nothing new came up to replace it.`);
      }
    }

    async function restorePlace(tripPlaceId: string) {
      await setStatus(tripPlaceId, "suggested");
    }

    async function archiveAsk(askId: string) {
      const write = store.getState().removeAskTab(askId);
      const result = await archiveAskAction(askId);
      if (!result.ok) fail(write, result.error);
      else write.commit();
    }

    /** "In my places". Throws when the server refused, so the profile restores its toggle. */
    async function toggleMyPlace(tripPlaceId: string, saved: boolean): Promise<void> {
      const result = await toggleMyPlaceAction(tripId(), tripPlaceId, saved);
      if (!result.ok) throw new Error(result.error);
      store.getState().dispatch({ type: "placePatch", tripPlaceId, patch: { yourPlace: result.data.yourPlace ?? undefined } });
      toast(saved ? "Saved to My places" : "Removed from My places");
    }

    /** The private note on a saved place. Throws when the server refused, so the editor stays open. */
    async function editMyPlaceNote(advisorPlaceId: string, note: string): Promise<void> {
      const result = await editMyPlaceNoteAction(advisorPlaceId, note);
      if (!result.ok) throw new Error(result.error);
      const state = store.getState();
      for (const card of Object.values(state.places)) {
        if (card.yourPlace?.advisorPlaceId === advisorPlaceId) {
          state.dispatch({ type: "placePatch", tripPlaceId: card.tripPlaceId, patch: { yourPlace: { advisorPlaceId, note: result.data.note } } });
        }
      }
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
      moveToSlot,
      emptySlotKeepNote,
      removePlace,
      replacePlace,
      restorePlace,
      archiveAsk,
      toggleMyPlace,
      editMyPlaceNote,
      refetchSnapshot,
    };
  }, [store]);
}
