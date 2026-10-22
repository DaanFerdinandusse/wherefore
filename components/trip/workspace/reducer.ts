// The fold from workspace events into TripWorkspaceState. Pure: no React, no
// fetch, no window. Places arrive from two sources that OVERLAP (the server
// snapshot and the chat stream's preliminary and final tool outputs), so every
// path merges by tripPlaceId and every transition is idempotent under replay.

import type { Ask, Category, ItinerarySlot, SlotName, TripPlaceCard, TripPlaceStatus, TripSnapshot } from "@/lib/contracts";
import { DEFAULT_UNSET_DAYS, daysBetween } from "@/lib/trips/stage";

import type { BoardTab, MapCamera, PlacesMeta, TripView, TripWorkspaceState } from "../contracts";

export const SLOT_ORDER: readonly SlotName[] = ["morning", "lunch", "afternoon", "dinner", "night", "stay"];
export const BOARD_CATEGORIES = ["eat", "drink", "coffee", "see", "stay"] as const;
export type BoardCategory = (typeof BOARD_CATEGORIES)[number];

/**
 * The store's state: the shared contract plus the day count asked for with
 * "Add a day" (absolute, so filling an added day never adds another), and the
 * revision stamps the optimistic patches in patches.ts check before a rollback.
 */
export type WorkspaceState = TripWorkspaceState & {
  /** The day count "Add a day" asked for; 0 until it is used. */
  requestedDays: number;
  /** Bumped by every change; the last revision that touched each entity key is in `revs`. */
  revision: number;
  revs: Record<string, number>;
};

/** A slot as the UI writes it: identified by (day, slot, position), not by row id. */
export type SlotWrite = {
  day: number;
  slot: SlotName;
  position?: number;
  /** null empties the slot (the row goes away, as clearSlot deletes it). */
  tripPlaceId: string | null;
  note?: string;
  /** Show the note to the traveler. Kept from the row when left out. */
  noteForTraveler?: boolean;
  date?: string;
};

export type WorkspaceEvent =
  | { type: "snapshot"; snapshot: TripSnapshot }
  | { type: "places"; places: TripPlaceCard[]; meta: PlacesMeta }
  | { type: "highlight"; tripPlaceId: string | null }
  | { type: "select"; tripPlaceId: string | null }
  | { type: "view"; view: TripView }
  | { type: "tab"; tab: BoardTab }
  | { type: "camera"; camera: MapCamera | null }
  | { type: "slot"; write: SlotWrite }
  | { type: "slots"; slots: ItinerarySlot[] }
  /** The server's rows for writes that were applied optimistically: real ids replace the temporary ones. */
  | { type: "slotsSaved"; slots: ItinerarySlot[] }
  | { type: "status"; tripPlaceId: string; status: TripPlaceStatus }
  /** A field change from a workspace write ("In my places", a note). An explicit undefined clears. */
  | { type: "placePatch"; tripPlaceId: string; patch: Partial<Pick<TripPlaceCard, "yourPlace" | "reason">> }
  /** A card the server wrote outside a tool run (a replacement): merged by tripPlaceId. */
  | { type: "upsertPlace"; card: TripPlaceCard }
  | { type: "archiveAsk"; askId: string }
  | { type: "trip"; patch: Partial<TripSnapshot["trip"]> }
  | { type: "addDay" };

export function initialState(
  snapshot: TripSnapshot,
  client: Partial<Pick<WorkspaceState, "view" | "activeTab" | "selectedPlaceId" | "camera">> = {},
): WorkspaceState {
  const base: WorkspaceState = {
    trip: snapshot.trip,
    travelers: snapshot.travelers,
    places: {},
    asks: {},
    slots: [],
    view: client.view ?? "board",
    activeTab: client.activeTab ?? "all",
    highlightedPlaceId: null,
    selectedPlaceId: client.selectedPlaceId ?? null,
    camera: client.camera ?? null,
    requestedDays: 0,
    revision: 0,
    revs: {},
  };
  return reduce(base, { type: "snapshot", snapshot });
}

// Helpers

export const askTab = (askId: string): BoardTab => `ask:${askId}`;
export const askIdOf = (tab: BoardTab): string | null => (tab.startsWith("ask:") ? tab.slice(4) : null);

export const slotKey = (s: { day: number; slot: string; position?: number }) => `${s.day}|${s.slot}|${s.position ?? 0}`;

export function compareSlots(a: ItinerarySlot, b: ItinerarySlot): number {
  return a.day - b.day || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position;
}

/** Mirrors the server: in a slot means "added", otherwise "suggested". Removed stays removed. */
export function syncStatuses(places: Record<string, TripPlaceCard>, slots: ItinerarySlot[]): Record<string, TripPlaceCard> {
  const inItinerary = new Set(slots.map((s) => s.tripPlaceId).filter((id): id is string => !!id));
  let changed = false;
  const next: Record<string, TripPlaceCard> = {};
  for (const [id, card] of Object.entries(places)) {
    const wanted: TripPlaceStatus = card.status === "removed" ? "removed" : inItinerary.has(id) ? "added" : "suggested";
    if (wanted !== card.status) {
      changed = true;
      next[id] = { ...card, status: wanted };
    } else {
      next[id] = card;
    }
  }
  return changed ? next : places;
}

/** Defined fields of `incoming` win; an empty list never erases a filled one. */
function mergeCard(existing: TripPlaceCard | undefined, incoming: TripPlaceCard, askId?: string): TripPlaceCard {
  const askIds = new Set([...(existing?.askIds ?? []), ...(incoming.askIds ?? []), ...(askId ? [askId] : [])]);
  if (!existing) return { ...incoming, askIds: [...askIds] };
  const merged: TripPlaceCard = { ...existing };
  for (const key of Object.keys(incoming) as (keyof TripPlaceCard)[]) {
    const value = incoming[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  // Status is the workspace's: the itinerary and "Not for" decide it, a tool
  // output only carries what the row said when the tool read it.
  merged.status = incoming.status === "removed" ? "removed" : existing.status;
  merged.askIds = [...askIds];
  return merged;
}

function askStatusFor(phase: string, current?: Ask["status"]): Ask["status"] {
  if (phase === "error" || phase === "failed") return "failed";
  if (phase === "done") return "done";
  // SETTLED GUARD: a replayed preliminary output after the final one must not
  // put a finished tab back into its spinner.
  if (current === "done" || current === "failed" || current === "archived") return current;
  return "running";
}

export function reduce(state: WorkspaceState, event: WorkspaceEvent): WorkspaceState {
  switch (event.type) {
    case "snapshot": {
      // The server is canonical for data; client state (view, tab, highlight,
      // selection, camera) is kept, minus references to rows that are gone.
      const { snapshot } = event;
      const places: Record<string, TripPlaceCard> = {};
      for (const card of snapshot.places) places[card.tripPlaceId] = card;
      const asks: Record<string, Ask> = {};
      for (const ask of snapshot.asks) asks[ask.id] = ask;
      const activeAsk = askIdOf(state.activeTab);
      const activeTab = activeAsk && !asks[activeAsk] ? "all" : state.activeTab;
      return {
        ...state,
        trip: snapshot.trip,
        travelers: snapshot.travelers,
        places,
        asks,
        slots: [...snapshot.slots].sort(compareSlots),
        activeTab,
        highlightedPlaceId: state.highlightedPlaceId && places[state.highlightedPlaceId] ? state.highlightedPlaceId : null,
        selectedPlaceId: state.selectedPlaceId && places[state.selectedPlaceId] ? state.selectedPlaceId : null,
        // The server is canonical: no optimistic rollback reaches past it.
        revs: {},
      };
    }

    case "places": {
      const { meta } = event;
      const places = { ...state.places };
      for (const card of event.places) places[card.tripPlaceId] = mergeCard(places[card.tripPlaceId], card, meta.askId);

      let asks = state.asks;
      let activeTab = state.activeTab;
      if (meta.askId) {
        const current = state.asks[meta.askId];
        if (current?.status === "archived") {
          // The advisor closed this tab; late frames still merge the places.
          return { ...state, places };
        }
        const members = Object.values(places).filter((p) => p.askIds.includes(meta.askId!)).length;
        const ask: Ask = {
          id: meta.askId,
          label: meta.label ?? current?.label ?? "Your ask",
          status: askStatusFor(meta.phase, current?.status),
          resultCount: Math.max(current?.resultCount ?? 0, members, meta.count ?? 0),
          elapsedMs: meta.elapsedMs ?? current?.elapsedMs,
          toolCallId: meta.toolCallId,
          loosened: meta.loosened ?? current?.loosened ?? [],
        };
        asks = { ...state.asks, [ask.id]: ask };
        // A new ask opens its tab, as in F7: the board shows what is arriving.
        if (!current && (state.view === "board" || state.view === "map")) activeTab = askTab(ask.id);
      }

      // Places without an ask come from the seed: the board leaves its skeleton.
      const trip =
        !meta.askId && event.places.length > 0 && state.trip.seedStatus === "pending"
          ? { ...state.trip, seedStatus: "running" as const }
          : state.trip;
      return { ...state, trip, places, asks, activeTab };
    }

    case "highlight":
      if (state.highlightedPlaceId === event.tripPlaceId) return state;
      return { ...state, highlightedPlaceId: event.tripPlaceId };

    case "select":
      return { ...state, selectedPlaceId: event.tripPlaceId };

    case "view":
      return { ...state, view: event.view };

    case "tab": {
      const askId = askIdOf(event.tab);
      if (askId && (!state.asks[askId] || state.asks[askId].status === "archived")) return state;
      return { ...state, activeTab: event.tab };
    }

    case "camera":
      return { ...state, camera: event.camera };

    case "slot": {
      const { write } = event;
      const key = slotKey(write);
      const index = state.slots.findIndex((s) => slotKey(s) === key);
      let slots: ItinerarySlot[];
      if (write.tripPlaceId === null && write.note === undefined) {
        // Clearing deletes the row, note included, like clearSlot.
        slots = index === -1 ? state.slots : state.slots.filter((_, i) => i !== index);
      } else {
        const existing = index === -1 ? undefined : state.slots[index];
        const slot: ItinerarySlot = {
          id: existing?.id ?? `optimistic:${key}`,
          day: write.day,
          slot: write.slot,
          position: write.position ?? 0,
          date: write.date ?? existing?.date,
          tripPlaceId: write.tripPlaceId ?? undefined,
          note: write.note ?? existing?.note ?? "",
          noteForTraveler: write.noteForTraveler ?? existing?.noteForTraveler ?? false,
        };
        slots = index === -1 ? [...state.slots, slot] : state.slots.map((s, i) => (i === index ? slot : s));
      }
      slots = [...slots].sort(compareSlots);
      return { ...state, slots, places: syncStatuses(state.places, slots) };
    }

    case "slots": {
      const slots = [...event.slots].sort(compareSlots);
      const revs = Object.fromEntries(Object.entries(state.revs).filter(([key]) => !key.startsWith("slot:")));
      return { ...state, slots, places: syncStatuses(state.places, slots), revs };
    }

    case "slotsSaved": {
      if (event.slots.length === 0) return state;
      const saved = new Map(event.slots.map((s) => [slotKey(s), s]));
      const kept = state.slots.filter((s) => !saved.has(slotKey(s)));
      const slots = [...kept, ...saved.values()].sort(compareSlots);
      return { ...state, slots, places: syncStatuses(state.places, slots) };
    }

    case "status": {
      const card = state.places[event.tripPlaceId];
      if (!card) return state;
      const places = { ...state.places, [card.tripPlaceId]: { ...card, status: event.status } };
      if (event.status !== "removed") return { ...state, places: syncStatuses(places, state.slots) };
      // "Removed" also empties any slot holding the place (the row and its note stay).
      const slots = state.slots.map((s) => (s.tripPlaceId === card.tripPlaceId ? { ...s, tripPlaceId: undefined } : s));
      return {
        ...state,
        places,
        slots,
        highlightedPlaceId: state.highlightedPlaceId === card.tripPlaceId ? null : state.highlightedPlaceId,
        selectedPlaceId: state.selectedPlaceId === card.tripPlaceId ? null : state.selectedPlaceId,
      };
    }

    case "placePatch": {
      const card = state.places[event.tripPlaceId];
      if (!card) return state;
      return { ...state, places: { ...state.places, [card.tripPlaceId]: { ...card, ...event.patch } } };
    }

    case "upsertPlace": {
      const places = { ...state.places, [event.card.tripPlaceId]: mergeCard(state.places[event.card.tripPlaceId], event.card) };
      return { ...state, places: syncStatuses(places, state.slots) };
    }

    case "archiveAsk": {
      const ask = state.asks[event.askId];
      if (!ask) return state;
      const places: Record<string, TripPlaceCard> = {};
      for (const [id, card] of Object.entries(state.places)) {
        places[id] = card.askIds.includes(ask.id) ? { ...card, askIds: card.askIds.filter((a) => a !== ask.id) } : card;
      }
      return {
        ...state,
        places,
        asks: { ...state.asks, [ask.id]: { ...ask, status: "archived" } },
        activeTab: state.activeTab === askTab(ask.id) ? "all" : state.activeTab,
      };
    }

    case "trip":
      return { ...state, trip: { ...state.trip, ...event.patch } };

    case "addDay":
      return { ...state, requestedDays: dayCount(state) + 1 };
  }
}

// Selectors

/** Asks that still have a tab, oldest first (insertion order of the snapshot). */
export function liveAsks(state: Pick<WorkspaceState, "asks">): Ask[] {
  return Object.values(state.asks).filter((a) => a.status !== "archived");
}

function byScore(a: TripPlaceCard, b: TripPlaceCard): number {
  return (b.score ?? -1) - (a.score ?? -1);
}

/** Places that are not removed, best score first. */
export function boardPlaces(state: Pick<WorkspaceState, "places">): TripPlaceCard[] {
  return Object.values(state.places)
    .filter((p) => p.status !== "removed")
    .sort(byScore);
}

/** The cards the active tab shows. An ask tab shows its own places and hides the rest. */
export function visiblePlaces(state: Pick<WorkspaceState, "places" | "activeTab">): TripPlaceCard[] {
  const all = boardPlaces(state);
  const tab = state.activeTab;
  if (tab === "all") return all;
  const askId = askIdOf(tab);
  if (askId) return all.filter((p) => p.askIds.includes(askId));
  return all.filter((p) => p.category === tab);
}

export function activeAskPlaceIds(state: Pick<WorkspaceState, "places" | "activeTab">): string[] {
  const askId = askIdOf(state.activeTab);
  if (!askId) return [];
  return boardPlaces(state)
    .filter((p) => p.askIds.includes(askId))
    .map((p) => p.tripPlaceId);
}

export type TabCounts = Record<"all" | BoardCategory, number>;

export function tabCounts(state: Pick<WorkspaceState, "places">): TabCounts {
  const counts: TabCounts = { all: 0, eat: 0, drink: 0, coffee: 0, see: 0, stay: 0 };
  for (const p of boardPlaces(state)) {
    counts.all += 1;
    if (p.category !== "other") counts[p.category] += 1;
  }
  return counts;
}

/**
 * Itinerary days: the largest of the dates' days (three without dates), the
 * highest day a slot uses and the count "Add a day" asked for.
 */
export function dayCount(state: Pick<WorkspaceState, "trip" | "slots" | "requestedDays">): number {
  const { startDate, endDate } = state.trip;
  const fromDates = startDate && endDate ? daysBetween(startDate, endDate) : DEFAULT_UNSET_DAYS;
  const maxDay = state.slots.reduce((max, s) => Math.max(max, s.day), 0);
  return Math.max(fromDates, maxDay, state.requestedDays);
}

/** The ISO date of a trip day, when the trip has a start date. */
export function dateOfDay(trip: TripSnapshot["trip"], day: number): string | undefined {
  if (!trip.startDate) return undefined;
  const date = new Date(`${trip.startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

export function slotAt(
  slots: ItinerarySlot[],
  day: number,
  slot: SlotName,
  position = 0,
): ItinerarySlot | undefined {
  return slots.find((s) => s.day === day && s.slot === slot && s.position === position);
}

const isFree = (slots: ItinerarySlot[], day: number, slot: SlotName) => !slotAt(slots, day, slot)?.tripPlaceId;

// Which slots a place of each category goes to first, in order.
const PREFERRED: Record<Category, SlotName[]> = {
  eat: ["lunch", "dinner"],
  drink: ["night", "afternoon"],
  coffee: ["morning", "afternoon"],
  see: ["morning", "afternoon"],
  stay: ["stay"],
  other: ["morning", "afternoon", "lunch", "dinner", "night"],
};

/** The slot categories fill first, for "Add" on an empty slot ("lunch" opens Eat). */
export function categoryForSlot(slot: SlotName): BoardCategory {
  if (slot === "lunch" || slot === "dinner") return "eat";
  if (slot === "night") return "drink";
  if (slot === "stay") return "stay";
  if (slot === "morning") return "coffee";
  return "see";
}

/**
 * The next free slot for a place: the earliest day with a free slot that suits
 * its category. Null when every suitable slot is taken (the UI opens a picker).
 */
export function nextFreeSlot(
  state: Pick<WorkspaceState, "trip" | "slots" | "requestedDays">,
  category: Category,
): { day: number; slot: SlotName } | null {
  const days = dayCount(state);
  const preferred = PREFERRED[category];
  for (let day = 1; day <= days; day++) {
    for (const slot of preferred) if (isFree(state.slots, day, slot)) return { day, slot };
  }
  return null;
}

export function filledSlotCount(slots: ItinerarySlot[]): number {
  return slots.filter((s) => !!s.tripPlaceId).length;
}

export type SlotRef = { day: number; slot: SlotName; position?: number };

/** Every row of a day's slot, by position. */
export function slotRows(slots: ItinerarySlot[], day: number, slot: SlotName): ItinerarySlot[] {
  return slots.filter((s) => s.day === day && s.slot === slot).sort((a, b) => a.position - b.position);
}

/**
 * The writes for moving a place to another slot of the same day: an exact
 * swap of (place, note, noteForTraveler) between the two slots, so a note
 * never stays behind or doubles. A move onto a slot with no row takes the
 * source row away. Used by drag to reorder and the move up and down controls;
 * the server applies the same writes in one replace (applySlotWrites).
 */
export function swapWrites(slots: ItinerarySlot[], from: SlotRef, to: SlotRef): SlotWrite[] {
  const a = { day: from.day, slot: from.slot, position: from.position ?? 0 };
  const b = { day: to.day, slot: to.slot, position: to.position ?? 0 };
  if (slotKey(a) === slotKey(b)) return [];
  const source = slotAt(slots, a.day, a.slot, a.position);
  if (!source?.tripPlaceId) return [];
  const target = slotAt(slots, b.day, b.slot, b.position);
  return [
    { ...b, tripPlaceId: source.tripPlaceId, note: source.note, noteForTraveler: source.noteForTraveler ?? false },
    target
      ? { ...a, tripPlaceId: target.tripPlaceId ?? null, note: target.note, noteForTraveler: target.noteForTraveler ?? false }
      : { ...a, tripPlaceId: null },
  ];
}

/** A slot row's content, as the server's replace writes it. */
export type SlotContent = {
  day: number;
  slot: SlotName;
  position: number;
  date?: string | null;
  tripPlaceId: string | null;
  note: string;
  noteForTraveler: boolean;
};

/**
 * Rows after the writes, with the reducer's rules: a write with no place and
 * no note takes the row away, any other write replaces the row's content.
 * Pure, so the server action and the tests share it.
 */
export function applySlotWrites(
  rows: readonly { day: number; slot: SlotName; position: number; date?: string | null; tripPlaceId?: string | null; note: string; noteForTraveler?: boolean }[],
  writes: readonly SlotWrite[],
): SlotContent[] {
  const byKey = new Map<string, SlotContent>();
  for (const r of rows) {
    byKey.set(slotKey(r), {
      day: r.day,
      slot: r.slot,
      position: r.position,
      date: r.date ?? null,
      tripPlaceId: r.tripPlaceId ?? null,
      note: r.note,
      noteForTraveler: r.noteForTraveler ?? false,
    });
  }
  for (const w of writes) {
    const key = slotKey(w);
    const existing = byKey.get(key);
    if (w.tripPlaceId === null && w.note === undefined) {
      byKey.delete(key);
      continue;
    }
    byKey.set(key, {
      day: w.day,
      slot: w.slot,
      position: w.position ?? 0,
      date: w.date ?? existing?.date ?? null,
      tripPlaceId: w.tripPlaceId,
      note: w.note ?? existing?.note ?? "",
      noteForTraveler: w.noteForTraveler ?? existing?.noteForTraveler ?? false,
    });
  }
  return [...byKey.values()];
}

/** The slot a move up or down lands on: the previous or next slot of the day. */
export function neighborSlot(slot: SlotName, direction: -1 | 1): SlotName | null {
  return SLOT_ORDER[SLOT_ORDER.indexOf(slot) + direction] ?? null;
}
