// Optimistic writes as inverse patches. An optimistic action applies its
// events, then records exactly the entities it changed (a slot, a place's
// status, its ask ids or "Your place", an ask's status, the active tab) with
// the value before and after. A rollback puts back only those entities, and
// only where no later change touched them since: every change stamps the
// entities it touched with a new revision, so a rollback never undoes a later
// successful write, a streamed place or a server snapshot. Pure: no React, no
// I/O; the store keeps the list of patches still in flight.

import type { Ask, ItinerarySlot, TripPlaceCard } from "@/lib/contracts";

import type { BoardTab } from "../contracts";

import { compareSlots, reduce, slotKey, syncStatuses, type WorkspaceEvent, type WorkspaceState } from "./reducer";

type EntityValue =
  | { kind: "slot"; key: string; row: ItinerarySlot | undefined }
  | { kind: "status"; tripPlaceId: string; status: TripPlaceCard["status"] | undefined }
  | { kind: "askIds"; tripPlaceId: string; askIds: string[] | undefined }
  | { kind: "yourPlace"; tripPlaceId: string; yourPlace: TripPlaceCard["yourPlace"] }
  | { kind: "ask"; askId: string; status: Ask["status"] | undefined }
  | { kind: "tab"; tab: BoardTab };

export type PatchEntry = {
  key: string;
  before: EntityValue;
  after: EntityValue;
  /** The revision the entity had before this patch; a rollback puts it back. */
  beforeRev: number | undefined;
};

export type Patch = { rev: number; entries: PatchEntry[] };

type Entities = Map<string, { value: EntityValue; signature: unknown }>;

/** Every entity a patch can touch, with a signature that changes when its value does. */
function entities(state: WorkspaceState): Entities {
  const out: Entities = new Map();
  for (const row of state.slots) {
    const key = slotKey(row);
    out.set(`slot:${key}`, { value: { kind: "slot", key, row }, signature: row });
  }
  for (const card of Object.values(state.places)) {
    const id = card.tripPlaceId;
    out.set(`status:${id}`, { value: { kind: "status", tripPlaceId: id, status: card.status }, signature: card.status });
    out.set(`askIds:${id}`, {
      value: { kind: "askIds", tripPlaceId: id, askIds: card.askIds },
      signature: [...card.askIds].sort().join(","),
    });
    out.set(`yourPlace:${id}`, {
      value: { kind: "yourPlace", tripPlaceId: id, yourPlace: card.yourPlace },
      signature: card.yourPlace ? `${card.yourPlace.advisorPlaceId}|${card.yourPlace.note}` : "",
    });
  }
  for (const ask of Object.values(state.asks)) {
    out.set(`ask:${ask.id}`, { value: { kind: "ask", askId: ask.id, status: ask.status }, signature: ask.status });
  }
  out.set("tab", { value: { kind: "tab", tab: state.activeTab }, signature: state.activeTab });
  return out;
}

/** The value an entity has when it is absent from the state. */
function absent(key: string): EntityValue {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (kind === "slot") return { kind: "slot", key: id, row: undefined };
  if (kind === "status") return { kind: "status", tripPlaceId: id, status: undefined };
  if (kind === "askIds") return { kind: "askIds", tripPlaceId: id, askIds: undefined };
  if (kind === "yourPlace") return { kind: "yourPlace", tripPlaceId: id, yourPlace: undefined };
  if (kind === "ask") return { kind: "ask", askId: id, status: undefined };
  return { kind: "tab", tab: "all" };
}

/** The entities that differ between two states, keyed like the revision stamps. */
export function changedEntities(before: WorkspaceState, after: WorkspaceState): { key: string; before: EntityValue; after: EntityValue }[] {
  const a = entities(before);
  const b = entities(after);
  const keys = new Set([...a.keys(), ...b.keys()]);
  const changed: { key: string; before: EntityValue; after: EntityValue }[] = [];
  for (const key of keys) {
    const x = a.get(key);
    const y = b.get(key);
    if (x && y && x.signature === y.signature) continue;
    changed.push({ key, before: x?.value ?? absent(key), after: y?.value ?? absent(key) });
  }
  return changed;
}

/**
 * A change that is not a rollback (a server answer, a streamed place, a
 * view change): applied as is, and every entity it touched gets a new
 * revision so no older patch can roll it back. A snapshot clears the stamps
 * (reduce does it): the server is canonical.
 */
export function applyRemote(state: WorkspaceState, event: WorkspaceEvent): WorkspaceState {
  const next = reduce(state, event);
  if (next === state) return state;
  if (event.type === "snapshot") return { ...next, revision: state.revision + 1 };
  const changed = changedEntities(state, next);
  if (changed.length === 0) return next;
  const revision = state.revision + 1;
  const revs = { ...next.revs };
  for (const c of changed) revs[c.key] = revision;
  return { ...next, revision, revs };
}

/** Applies the events of one optimistic write and returns its inverse patch. */
export function applyOptimistic(state: WorkspaceState, events: WorkspaceEvent[]): { state: WorkspaceState; patch: Patch } {
  const next = events.reduce(reduce, state);
  const rev = state.revision + 1;
  const changed = changedEntities(state, next);
  const revs = { ...next.revs };
  const entries: PatchEntry[] = changed.map((c) => ({ ...c, beforeRev: state.revs[c.key] }));
  for (const c of changed) revs[c.key] = rev;
  return { state: { ...next, revision: rev, revs }, patch: { rev, entries } };
}

function restore(state: WorkspaceState, value: EntityValue): WorkspaceState {
  switch (value.kind) {
    case "slot": {
      const kept = state.slots.filter((s) => slotKey(s) !== value.key);
      return { ...state, slots: value.row ? [...kept, value.row].sort(compareSlots) : kept };
    }
    case "status":
    case "askIds":
    case "yourPlace": {
      const card = state.places[value.tripPlaceId];
      if (!card) return state;
      const patch =
        value.kind === "status"
          ? value.status
            ? { status: value.status }
            : {}
          : value.kind === "askIds"
            ? value.askIds
              ? { askIds: value.askIds }
              : {}
            : { yourPlace: value.yourPlace };
      return { ...state, places: { ...state.places, [card.tripPlaceId]: { ...card, ...patch } } };
    }
    case "ask": {
      const ask = state.asks[value.askId];
      if (!ask || !value.status) return state;
      return { ...state, asks: { ...state.asks, [ask.id]: { ...ask, status: value.status } } };
    }
    case "tab": {
      const askId = value.tab.startsWith("ask:") ? value.tab.slice(4) : null;
      if (askId && (!state.asks[askId] || state.asks[askId].status === "archived")) return state;
      return { ...state, activeTab: value.tab };
    }
  }
}

/**
 * Rolls back one patch. Each entity it changed goes back to its value before
 * the patch, unless something touched it since: a later write still in
 * flight inherits the "before" (so its own rollback lands on the right
 * value), anything else (a later success, the server) wins and stays.
 * Returns the new state and the patches still in flight.
 */
export function revertPatch(
  state: WorkspaceState,
  patch: Patch,
  pending: readonly Patch[],
): { state: WorkspaceState; pending: Patch[] } {
  // An earlier rollback may have handed this patch a new "before": use the pending copy.
  const self = pending.find((p) => p.rev === patch.rev) ?? patch;
  let next = state;
  let rest = pending.filter((p) => p.rev !== patch.rev);
  const revs = { ...state.revs };
  let touchedSlots = false;
  for (const entry of self.entries) {
    if (revs[entry.key] === patch.rev) {
      next = restore(next, entry.before);
      if (entry.beforeRev === undefined) delete revs[entry.key];
      else revs[entry.key] = entry.beforeRev;
      if (entry.before.kind === "slot") touchedSlots = true;
      continue;
    }
    const later = rest
      .filter((p) => p.rev > patch.rev && p.entries.some((e) => e.key === entry.key))
      .sort((a, b) => a.rev - b.rev)[0];
    if (!later) continue;
    rest = rest.map((p) =>
      p === later
        ? {
            ...p,
            entries: p.entries.map((e) => (e.key === entry.key ? { ...e, before: entry.before, beforeRev: entry.beforeRev } : e)),
          }
        : p,
    );
  }
  if (next === state) return { state: { ...state, revs }, pending: rest };
  const places = touchedSlots ? syncStatuses(next.places, next.slots) : next.places;
  return { state: { ...next, places, revs }, pending: rest };
}

/** A write the server accepted: its patch leaves the list, its changes stay. */
export function commitPatch(pending: readonly Patch[], patch: Patch): Patch[] {
  return pending.filter((p) => p.rev !== patch.rev);
}
