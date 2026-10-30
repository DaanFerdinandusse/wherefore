// The parts of a day. Each part has a meal slot, which holds one place, and an
// open slot named after the part, which holds any number (positions 0, 1, 2)
// of anything: a museum next to lunch, two bars after dinner. Pure and free of
// server imports, so the server, the agent tools and the UI share one list.

import type { Category, ItinerarySlot, SlotName } from "@/lib/contracts";

export type DayPart = "morning" | "afternoon" | "night";

export const SLOT_ORDER: readonly SlotName[] = ["breakfast", "morning", "lunch", "afternoon", "dinner", "night", "stay"];

export const SLOT_LABELS: Record<SlotName, string> = {
  breakfast: "Breakfast",
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  night: "Night",
  stay: "Stay",
};

export const DAY_PARTS: readonly { part: DayPart; label: string; meal: SlotName; open: SlotName }[] = [
  { part: "morning", label: "Morning", meal: "breakfast", open: "morning" },
  { part: "afternoon", label: "Afternoon", meal: "lunch", open: "afternoon" },
  { part: "night", label: "Night", meal: "dinner", open: "night" },
];

/** Which slots a place of each category goes to first, in order. */
export const PREFERRED_SLOTS: Record<Category, readonly SlotName[]> = {
  eat: ["lunch", "dinner"],
  drink: ["night", "afternoon"],
  coffee: ["breakfast", "morning", "afternoon"],
  see: ["morning", "afternoon"],
  stay: ["stay"],
  other: ["morning", "afternoon", "night"],
};

export function isOpenSlot(slot: SlotName): boolean {
  return DAY_PARTS.some((p) => p.open === slot);
}

/**
 * What a slot may hold. A meal is for a restaurant or a cafe. Morning,
 * afternoon and night are for everything that is not a meal, and a cafe. The
 * stay is for a hotel, which goes nowhere else.
 */
export function slotHolds(slot: SlotName, category: Category): boolean {
  if (slot === "stay" || category === "stay") return slot === category;
  if (isOpenSlot(slot)) return category !== "eat";
  return category === "eat" || category === "coffee";
}

const SLOT_RULES: Record<Category, string> = {
  eat: "Restaurants go in breakfast, lunch or dinner.",
  coffee: "Cafes go in a meal or a part of the day.",
  drink: "Bars go in morning, afternoon or night.",
  see: "Sights go in morning, afternoon or night.",
  other: "This place goes in morning, afternoon or night.",
  stay: "Hotels go in the stay. Add them from their card.",
};

/** Why a place does not fit a slot, for the drop target, a toast and the agent. */
export function slotRule(category: Category): string {
  return SLOT_RULES[category];
}

/** Where a place goes once its preferred slots are full on every day. Null when no open slot may hold it. */
export function overflowSlot(category: Category): SlotName | null {
  return PREFERRED_SLOTS[category].find(isOpenSlot) ?? null;
}

type SlotRow = Pick<ItinerarySlot, "day" | "slot" | "position" | "tripPlaceId" | "note">;

/** The position after the slot's last row that holds something. A row left with no place and no note is reused. */
export function nextPosition(rows: readonly SlotRow[], day: number, slot: SlotName): number {
  const held = rows.filter((r) => r.day === day && r.slot === slot && (r.tripPlaceId || r.note.trim()));
  return held.reduce((next, r) => Math.max(next, r.position + 1), 0);
}

/** Where a new place lands: a meal has one place, an open slot takes one more. */
export function addPosition(rows: readonly SlotRow[], target: { day: number; slot: SlotName }): number {
  return isOpenSlot(target.slot) ? nextPosition(rows, target.day, target.slot) : 0;
}

/**
 * Positions for places written together, in input order. Repeats of a meal in
 * one write take the next position, as they always have. An open slot appends
 * after what is stored, and a place already in it keeps its position, so a
 * retried write lands on the same rows.
 */
export function appendPositions(
  asked: readonly { day: number; slot: SlotName; tripPlaceId: string }[],
  stored: readonly SlotRow[],
): number[] {
  const rows = [...stored];
  const counts = new Map<string, number>();
  return asked.map((s) => {
    const key = `${s.day}|${s.slot}`;
    const nth = counts.get(key) ?? 0;
    counts.set(key, nth + 1);
    if (!isOpenSlot(s.slot)) return nth;
    const held = rows.find((r) => r.day === s.day && r.slot === s.slot && r.tripPlaceId === s.tripPlaceId);
    if (held) return held.position;
    const position = nextPosition(rows, s.day, s.slot);
    rows.push({ ...s, position, note: "" });
    return position;
  });
}
