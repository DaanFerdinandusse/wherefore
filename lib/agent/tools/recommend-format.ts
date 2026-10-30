import type { PlaceKeyword, SlotName } from "@/lib/contracts";
import { SLOT_ORDER as SLOTS } from "@/lib/trips/day-parts";

// Pure pieces of recommend_place: which sentence of the advisor's notes on
// the client names something the place is known for, and reading the slot
// target an ask stored in its query. No I/O; tested in recommend.test.ts.

const MAX_NOTE_CHARS = 120;

const fold = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/** The sentences of a free text note, trimmed, without empty ones. */
export function noteSentences(notes: string): string[] {
  return notes
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Does `text` contain `term` as whole words (singular or plural)? */
export function mentions(text: string, term: string): boolean {
  const words = fold(term).trim();
  if (words.length < 3) return false;
  const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/s$/, "");
  return new RegExp(`(^|[^\\p{L}])${escaped}(e?s)?($|[^\\p{L}])`, "u").test(fold(text));
}

/**
 * The first sentence of the advisor's notes on the client that names one of
 * the place's keywords or dishes, with the terms it names. Null when none
 * does: the card then shows no quote, never a made up one.
 */
export function matchClientNote(
  notes: string | null | undefined,
  terms: readonly (PlaceKeyword | string)[],
): { text: string; matches: string[] } | null {
  if (!notes?.trim()) return null;
  const names = [...new Set(terms.map((t) => (typeof t === "string" ? t : t.name)).filter(Boolean))];
  for (const sentence of noteSentences(notes)) {
    if (sentence.length > MAX_NOTE_CHARS) continue;
    const matches = names.filter((name) => mentions(sentence, name));
    if (matches.length > 0) return { text: sentence.replace(/[.!]+$/, ""), matches };
  }
  return null;
}

/** The slot target stored in an ask's query, if it is a valid one. */
export function targetOfQuery(query: Record<string, unknown> | null | undefined): { day: number; slot: SlotName } | null {
  const target = query?.target;
  if (!target || typeof target !== "object") return null;
  const { day, slot } = target as { day?: unknown; slot?: unknown };
  if (typeof day !== "number" || !Number.isInteger(day) || day < 1) return null;
  if (typeof slot !== "string" || !(SLOTS as readonly string[]).includes(slot)) return null;
  return { day, slot: slot as SlotName };
}

/** The place an ask's weighing picked, if it weighed any. */
export function weighedPick(query: Record<string, unknown> | null | undefined): string | undefined {
  const verdicts = query?.verdicts;
  if (!Array.isArray(verdicts)) return undefined;
  for (const verdict of verdicts as { stand?: unknown; tripPlaceId?: unknown }[]) {
    if (verdict?.stand === "pick" && typeof verdict.tripPlaceId === "string") return verdict.tripPlaceId;
  }
  return undefined;
}
