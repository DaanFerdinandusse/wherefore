// The itinerary panel's model: which slots each day shows, what fills them,
// and every line of copy on a row. Pure, so it is tested without React.
// Every sentence is a code template over facts the API returned (dishes,
// review keywords with counts, favorite shares, shared taste tags) or the
// advisor's own notes.
// A template with no fact behind it returns nothing and the UI hides that
// element. Never model prose, never demo data.

import type { Ask, Category, ItinerarySlot, PlaceVerdict, SlotName, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import { likeLine } from "@/lib/agent/taste-overlap";
import { favoriteDrivers } from "@/lib/qloo/normalize";
import { addPosition, DAY_PARTS, isOpenSlot, nextPosition, slotHolds, type DayPart } from "@/lib/trips/day-parts";

import { SLOT_LABELS } from "../workspace/format";
import { compareSlots, dateOfDay, dayCount, nextFreeSlot, slotKey, SLOT_ORDER, type SlotRef, type WorkspaceState } from "../workspace/reducer";

// ------------------------------------------------------------------ names

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/** "Ana", "Ana and Clara", "Ana, Clara and Leo". */
export function joinNames(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}

// ------------------------------------------------------------------ dates

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** "Friday" */
export function weekday(iso: string): string {
  return WEEKDAYS[utc(iso).getUTCDay()];
}

/** "Fri" */
export function weekdayShort(iso: string): string {
  return weekday(iso).slice(0, 3);
}

/** "Fri 14 May" */
export function dayDate(iso: string): string {
  const d = utc(iso);
  return `${weekdayShort(iso)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Friday 14 May" */
export function dayLong(iso: string): string {
  const d = utc(iso);
  return `${weekday(iso)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function nightsBetween(start: string, end: string): number {
  return Math.max(0, Math.round((utc(end).getTime() - utc(start).getTime()) / 86_400_000));
}

/** "Fri 14 to Tue 18 May · 4 nights", "Thu 30 Apr to Sat 2 May · 2 nights". Null without dates. */
export function coverDates(startDate?: string, endDate?: string): string | null {
  if (!startDate) return null;
  if (!endDate) return `From ${dayDate(startDate)}`;
  const a = utc(startDate);
  const b = utc(endDate);
  const nights = nightsBetween(startDate, endDate);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const from = sameMonth ? `${weekdayShort(startDate)} ${a.getUTCDate()}` : dayDate(startDate);
  return `${from} to ${dayDate(endDate)} · ${nights} ${nights === 1 ? "night" : "nights"}`;
}

/** "Fri 14 to Tue 18 May", the range without the nights. */
export function dateRange(startDate?: string, endDate?: string): string | null {
  return coverDates(startDate, endDate)?.split(" · ")[0] ?? null;
}

// ------------------------------------------------------------------ days and slots

/** The meal slots every day offers; the last day of a longer trip ends after lunch. */
export function defaultSlots(day: number, totalDays: number): SlotName[] {
  return totalDays > 1 && day === totalDays ? ["breakfast", "lunch"] : ["breakfast", "lunch", "dinner"];
}

/** One slot of a day as the panel shows it. */
export type SlotView = {
  day: number;
  slot: SlotName;
  position: number;
  row?: ItinerarySlot;
  /** The place in the slot. */
  card?: TripPlaceCard;
  /** The agent's line on that place. */
  verdict?: PlaceVerdict;
  /** A search running in the chat for this slot ("Finding dinner in the chat"). */
  finding?: Ask;
  /** A place the chat suggested for this open slot. */
  suggestion?: TripPlaceCard;
};

/** A part of a day: its meal, then what else is added to it, and where the next place lands. */
export type PartView = { part: DayPart; label: string; slots: SlotView[]; add: Required<SlotRef> };

export type DayView = {
  day: number;
  date?: string;
  /** Every row of the day in order: the parts, then the stay. */
  slots: SlotView[];
  /** The parts with something to show. The last day of a longer trip has no night until a place is added to it. */
  parts: PartView[];
  /** The stay rows, which belong to no part. */
  stay: SlotView[];
  filled: number;
  /** The most common neighborhood of the day's places. */
  neighborhood?: string;
};

type ModelState = Pick<WorkspaceState, "trip" | "slots" | "places" | "asks" | "requestedDays" | "selectedPlaceId">;

/** The row an ask aimed at a slot lands on: the meal, or the next place of an open slot. */
const targetKey = (target: NonNullable<Ask["target"]>, slots: ItinerarySlot[]) =>
  slotKey({ ...target, position: addPosition(slots, target) });

/** The live asks with a target slot, keyed by slot: running ones only. */
export function findingBySlot(asks: Ask[], slots: ItinerarySlot[]): Map<string, Ask> {
  const filled = new Set(slots.filter((s) => s.tripPlaceId).map(slotKey));
  const out = new Map<string, Ask>();
  for (const ask of asks) {
    if (ask.status !== "running" || !ask.target) continue;
    const key = targetKey(ask.target, slots);
    if (!filled.has(key)) out.set(key, ask);
  }
  return out;
}

/** The agent's latest line on a place, from whichever search weighed it. */
export function verdictOf(asks: Record<string, Pick<Ask, "verdicts">>, tripPlaceId: string): PlaceVerdict | undefined {
  let found: PlaceVerdict | undefined;
  for (const ask of Object.values(asks)) found = ask.verdicts?.find((v) => v.tripPlaceId === tripPlaceId) ?? found;
  return found;
}

const byScore = (a: TripPlaceCard, b: TripPlaceCard) => (b.score ?? -1) - (a.score ?? -1);

/**
 * The place suggested for each open slot. From an ask aimed at a slot: its
 * best place that is not in the itinerary or removed. An open slot never
 * fills up, so an ask stops suggesting there once one of its places is in it.
 * Then the place open in the chat (selected), for the next free slot that
 * suits it, when no ask already suggested something there.
 */
export function suggestionsBySlot(state: ModelState): Map<string, TripPlaceCard> {
  const filled = new Set(state.slots.filter((s) => s.tripPlaceId).map(slotKey));
  const places = Object.values(state.places);
  const out = new Map<string, TripPlaceCard>();
  const used = new Set<string>();
  for (const ask of Object.values(state.asks)) {
    if (!ask.target || ask.status === "archived" || ask.status === "failed") continue;
    const { day, slot } = ask.target;
    const key = targetKey(ask.target, state.slots);
    if (filled.has(key) || out.has(key)) continue;
    const answered = state.slots.some(
      (s) => s.day === day && s.slot === slot && s.tripPlaceId && state.places[s.tripPlaceId]?.askIds.includes(ask.id),
    );
    if (answered) continue;
    // A place the agent turned down is not a suggestion: after its pick comes its backup.
    const stands = new Map(ask.verdicts?.map((v) => [v.tripPlaceId, v.stand]));
    const candidates = places.filter(
      (p) => p.status === "suggested" && p.askIds.includes(ask.id) && slotHolds(slot, p.category) && stands.get(p.tripPlaceId) !== "out",
    );
    const best = candidates.find((p) => p.tripPlaceId === ask.pickTripPlaceId) ?? candidates.sort(byScore)[0];
    if (best) {
      out.set(key, best);
      used.add(best.tripPlaceId);
    }
  }
  const selected = state.selectedPlaceId ? state.places[state.selectedPlaceId] : undefined;
  if (selected && selected.status === "suggested" && !used.has(selected.tripPlaceId)) {
    const free = nextFreeSlot(state, selected.category);
    if (free && !out.has(slotKey(free))) out.set(slotKey(free), selected);
  }
  return out;
}

/**
 * What a part does with a place hovering over it. `armed`: a drop makes a new
 * row at the end of the part. `offered`: a row under the pointer takes the drop
 * and the new row shows next to it. `refused`: the part's open slot may not
 * hold the place. `none`: a row takes it and there is nothing to add, or the
 * card came from this open slot and a new row would only reorder it.
 */
export type PartDrop = "none" | "offered" | "armed" | "refused";

export function partDrop(
  add: Pick<SlotRef, "day" | "slot">,
  drag: { category: Category | null; from: Pick<SlotRef, "day" | "slot"> | null; rowTakes: boolean },
): PartDrop {
  if (drag.category && !slotHolds(add.slot, drag.category)) return drag.rowTakes ? "none" : "refused";
  if (drag.from?.day === add.day && drag.from.slot === add.slot) return "none";
  return drag.rowTakes ? "offered" : "armed";
}

/** Most common value, ties to the earliest. Blank values do not count. */
export function mostCommon(values: (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>();
  let best: string | undefined;
  for (const raw of values) {
    const v = raw?.trim();
    if (!v) continue;
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (!best || n > (counts.get(best) ?? 0)) best = v;
  }
  return best;
}

/** Every day of the trip with the slots it shows, in order. */
export function buildDays(state: ModelState): DayView[] {
  const total = dayCount(state);
  const finding = findingBySlot(Object.values(state.asks), state.slots);
  const suggestions = suggestionsBySlot(state);
  const days: DayView[] = [];
  for (let day = 1; day <= total; day++) {
    const rows = state.slots.filter((s) => s.day === day).sort(compareSlots);
    const views = new Map<string, SlotView>();
    for (const slot of defaultSlots(day, total)) views.set(slotKey({ day, slot }), { day, slot, position: 0 });
    for (const row of rows) {
      const stored = row.tripPlaceId ? state.places[row.tripPlaceId] : undefined;
      const card = stored?.status === "removed" ? undefined : stored;
      // A row without a place (a note on an open slot) still shows its slot.
      // In a part's open slot only a note keeps it: an empty one is no row.
      if (!card && isOpenSlot(row.slot) && !advisorNote(row)) continue;
      views.set(slotKey(row), { day, slot: row.slot, position: row.position, row, card });
    }
    // An open slot has no row until something lands in it, a search or a suggestion included.
    for (const key of [...finding.keys(), ...suggestions.keys()]) {
      const [keyDay, slot, position] = key.split("|");
      if (Number(keyDay) === day && !views.has(key)) views.set(key, { day, slot: slot as SlotName, position: Number(position) });
    }
    for (const [key, view] of views) {
      if (view.card) {
        const verdict = verdictOf(state.asks, view.card.tripPlaceId);
        if (verdict) view.verdict = verdict;
        continue;
      }
      const ask = finding.get(key);
      const suggestion = suggestions.get(key);
      if (ask) view.finding = ask;
      else if (suggestion) view.suggestion = suggestion;
    }
    const slots = [...views.values()].sort(
      (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position,
    );
    const cards = slots.flatMap((s) => (s.card ? [s.card] : []));
    const parts = DAY_PARTS.flatMap(({ part, label, meal, open }): PartView[] => {
      const inPart = slots.filter((s) => s.slot === meal || s.slot === open);
      if (inPart.length === 0) return [];
      return [{ part, label, slots: inPart, add: { day, slot: open, position: nextPosition(rows, day, open) } }];
    });
    days.push({
      day,
      date: dateOfDay(state.trip, day),
      slots,
      parts,
      stay: slots.filter((s) => s.slot === "stay"),
      filled: cards.length,
      neighborhood: mostCommon(cards.filter((c) => c.category !== "stay").map((c) => c.neighborhood)),
    });
  }
  return days;
}

const DAY_NOUN: Record<Category, string> = { eat: "", drink: "drinks", coffee: "coffee", see: "a sight", stay: "", other: "a stop" };
const MEALS = new Set<SlotName>(["breakfast", "lunch", "dinner"]);
const VOWEL = /^[aeiou]/i;

const CUISINE = /^(italian|french|japanese|mexican|spanish|portuguese|thai|greek|indian|chinese|korean|peruvian|mediterranean)$/i;

/** "Italian" stays capitalized, "Cozy" reads as "cozy". */
function tasteWord(tag: string): string {
  return CUISINE.test(tag) ? tag : tag.toLowerCase();
}

/** One place as the words of a day: "a loud Italian dinner", "cozy coffee". `used` keeps a day from repeating a word. */
function dayPhrase(card: TripPlaceCard, slot: SlotName, used: Set<string>): string | null {
  if (card.category === "stay") return null;
  const tags = card.sharedTags.map((t) => t.name.trim()).filter(Boolean);
  const taste = [...tags.filter((t) => CUISINE.test(t)), ...tags.filter((t) => !CUISINE.test(t))].find((t) => !used.has(t));
  if (taste) used.add(taste);
  if (card.category === "eat" || MEALS.has(slot)) {
    const meal = MEALS.has(slot) ? slot : "meal";
    if (!taste) return `a good ${meal}`;
    return `${VOWEL.test(taste) ? "an" : "a"} ${tasteWord(taste)} ${meal}`;
  }
  const noun = DAY_NOUN[card.category];
  return taste ? `${tasteWord(taste)} ${noun.replace(/^a /, "")}` : noun;
}

/** "A cozy breakfast, an Italian dinner, then chic drinks." Null below two places: that is no day yet. */
export function daySentence(day: Pick<DayView, "slots">): string | null {
  const used = new Set<string>();
  const phrases = day.slots.flatMap((s) => {
    const phrase = s.card ? dayPhrase(s.card, s.slot, used) : null;
    return phrase ? [phrase] : [];
  });
  if (phrases.length < 2) return null;
  const last = phrases.at(-1)!;
  const body = phrases.length === 2 ? `${phrases[0]}, then ${last}` : `${phrases.slice(0, -1).join(", ")}, then ${last}`;
  return `${body[0]!.toUpperCase()}${body.slice(1)}.`;
}

/** The taste the added places deliver, most delivered first: the client's words on top of the itinerary. */
export function tasteWords(days: readonly Pick<DayView, "slots">[], limit = 5): string[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    for (const slot of day.slots) {
      for (const tag of slot.card?.sharedTags ?? []) {
        const name = tag.name.trim();
        if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name]) => name);
}

/** The cover carries the facts once two slots hold a place; before that, the brief (S1) does. */
export function usesCover(days: DayView[]): boolean {
  return days.reduce((n, d) => n + d.filled, 0) >= 2;
}

/** The day the brief layout opens: the first with a place, a search or a suggestion, else day 1. */
export function openDay(days: DayView[]): number {
  return days.find((d) => d.slots.some((s) => s.card || s.finding || s.suggestion))?.day ?? 1;
}

/** "Friday 14 May" and "Príncipe Real" for "Friday 14 May in Príncipe Real"; "Day 2" without dates. */
export function dayTitle(day: Pick<DayView, "day" | "date" | "neighborhood">): { lead: string; place?: string } {
  return { lead: day.date ? dayLong(day.date) : `Day ${day.day}`, ...(day.neighborhood ? { place: day.neighborhood } : {}) };
}

/** "Day 1 · Arrival", "Day 3", "Day 5 · Departure". */
export function dayNote(day: number, total: number): string {
  if (total > 1 && day === 1) return "Day 1 · Arrival";
  if (total > 1 && day === total) return `Day ${day} · Departure`;
  return `Day ${day}`;
}

/** "Open", "1 of 3 added", "All added". */
export function dayStatus(day: Pick<DayView, "filled" | "slots">): string {
  if (day.filled === 0) return "Open";
  if (day.filled >= day.slots.length) return "All added";
  return `${day.filled} of ${day.slots.length} added`;
}

/** "Finding dinner in the chat", "Finding something for the afternoon in the chat". */
export function findingLabel(slot: SlotName): string {
  const name = SLOT_LABELS[slot].toLowerCase();
  return `Finding ${isOpenSlot(slot) ? `something for the ${name}` : name} in the chat`;
}

/** "Suggested in chat, 92 match. Not added yet." Without a score, the state only. */
export function suggestionHint(card: Pick<TripPlaceCard, "score">): string {
  const match = typeof card.score === "number" ? `, ${Math.round(card.score)} match` : "";
  return `Suggested in chat${match}. Not added yet.`;
}

// ------------------------------------------------------------------ the cover and the brief

export type CoverFacts = { dates: string | null; travelers: string | null; stay: string | null; progress: string };

/** The facts line under "Ana in Lisbon": dates and nights, who travels, where they stay, what is added and open. */
export function coverFacts(
  trip: Pick<TripSnapshot["trip"], "startDate" | "endDate">,
  travelers: Pick<TripSnapshot["travelers"][number], "name">[],
  days: DayView[],
): CoverFacts {
  const stay = days.flatMap((d) => d.slots).find((s) => s.slot === "stay" && s.card)?.card;
  const added = days.reduce((n, d) => n + d.filled, 0);
  const open = days.flatMap((d) => d.slots).filter((s) => !s.card && s.slot !== "stay").length;
  const names = travelers.map((t) => firstName(t.name)).filter(Boolean);
  return {
    dates: coverDates(trip.startDate, trip.endDate),
    travelers: names.length > 1 ? joinNames(names) : null,
    stay: stay ? `Staying at ${stay.name}` : null,
    progress: open > 0 ? `${added} added · ${open} open` : `${added} added`,
  };
}

/** "2 adults", "2 adults and 1 child". Null without a party. */
export function partyLabel(party?: { adults: number; children: number }): string | null {
  if (!party || party.adults < 1) return null;
  const adults = `${party.adults} ${party.adults === 1 ? "adult" : "adults"}`;
  if (party.children < 1) return adults;
  return `${adults} and ${party.children} ${party.children === 1 ? "child" : "children"}`;
}

/**
 * The brief's sentence (S1): "Ana and Clara, 2 adults. Fri 14 to Tue 18 May.
 * Nothing picked yet: tell me what Ana wants and I start with one slot."
 */
export function briefSentence(
  trip: Pick<TripSnapshot["trip"], "clientName" | "startDate" | "endDate" | "party">,
  travelers: Pick<TripSnapshot["travelers"][number], "name">[],
  days: DayView[],
): string {
  const client = firstName(trip.clientName);
  const names = travelers.length > 0 ? travelers.map((t) => firstName(t.name)) : [client];
  const party = partyLabel(trip.party);
  const who = [joinNames(names), party].filter(Boolean).join(", ");
  const dates = dateRange(trip.startDate, trip.endDate);
  const filled = days.reduce((n, d) => n + d.filled, 0);
  const total = days.reduce((n, d) => n + d.slots.length, 0);
  const progress =
    filled === 0
      ? `Nothing added yet: tell me what ${client} wants and I start with one slot.`
      : `${filled} of ${total} slots added.`;
  return [`${who}.`, dates ? `${dates}.` : null, progress].filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ a place in a slot

/** The noun for the place's kind, from our category. */
export const CATEGORY_NOUN: Record<Category, string> = {
  eat: "Restaurant",
  drink: "Bar",
  coffee: "Coffee",
  see: "Sight",
  stay: "Hotel",
  other: "Place",
};

const EURO = new Set([
  "AT", "BE", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES",
]);

/** "€€€" by the destination's currency sign ("$" when unknown). Null without a level. */
export function priceLabel(level: number | undefined, countryCode?: string): string | null {
  if (!level || level < 1 || level > 4) return null;
  const code = countryCode?.toUpperCase();
  const sign = code && EURO.has(code) ? "€" : code === "GB" ? "£" : code === "JP" ? "¥" : "$";
  return sign.repeat(level);
}

/** "Restaurant · Chiado · €€€". Without the noun when the row already says what the place is. */
export function subLine(
  card: Pick<TripPlaceCard, "category" | "neighborhood" | "priceLevel">,
  countryCode?: string,
  { noun = true }: { noun?: boolean } = {},
): string {
  return [noun ? CATEGORY_NOUN[card.category] : null, card.neighborhood?.trim() || null, priceLabel(card.priceLevel, countryCode)]
    .filter(Boolean)
    .join(" · ");
}

/** Reviews mention a keyword this often before it counts as a reason. */
export const KEYWORD_MIN_COUNT = 3;

/** The taste the place shares with the client, as badges: "Stylish", "Romantic", "Social". */
export function tasteBadges(card: Pick<TripPlaceCard, "sharedTags">, limit = 3): string[] {
  return card.sharedTags.map((t) => t.name.trim()).filter(Boolean).slice(0, limit);
}

/** The advisor's own note on a slot. Agent notes are never quoted. */
export function advisorNote(row?: Pick<ItinerarySlot, "note" | "noteSource">): string | null {
  if (!row || row.noteSource === "agent") return null;
  return row.note.trim() || null;
}

export type SlotReasons = {
  title: string;
  score?: number;
  /** The advisor's own note, quoted. */
  note?: { text: string; label: string };
  /** "Like Via Carota: Italian, warm, stylish", when a favorite shares enough of its taste. */
  like?: string;
  /** The favorites most behind the pick, biggest share first. */
  favorites: { entityId: string; name: string; share: number; imageUrl?: string; media?: boolean }[];
  /** What to order: the place's own specialty dishes, verbatim. */
  order: string[];
  /** "58 reviews mention martinis" */
  mentions: string[];
};

/**
 * What the row opens to: the advisor's note on the slot (or on the saved
 * place), the favorite it is most like, the favorites behind the pick with
 * their shares, what to order, and what reviews mention. Null when none exist.
 */
export function slotReasons(
  card: Pick<TripPlaceCard, "score" | "because" | "dishes" | "keywords" | "yourPlace">,
  clientName: string,
  options: { slotNote?: Pick<ItinerarySlot, "note" | "noteSource">; favoriteImages?: Map<string, string> } = {},
): SlotReasons | null {
  const client = firstName(clientName);
  const slotNote = advisorNote(options.slotNote);
  const placeNote = card.yourPlace?.note.trim();
  const note = slotNote
    ? { text: slotNote, label: `Your note on ${client}` }
    : placeNote
      ? { text: placeNote, label: "Your note on this place" }
      : undefined;

  const favorites = [...favoriteDrivers(card.because)]
    .sort((a, b) => b.share - a.share)
    .filter((d) => d.share > 0)
    .slice(0, 3)
    .map(({ entityId, name, share, media }) => {
      const imageUrl = options.favoriteImages?.get(entityId);
      return { entityId, name, share, ...(imageUrl ? { imageUrl } : {}), ...(media ? { media } : {}) };
    });
  const order = (card.dishes ?? []).map((d) => d.trim()).filter(Boolean).slice(0, 3);
  const mentions = (card.keywords ?? [])
    .filter((k) => k.count >= KEYWORD_MIN_COUNT && k.name.trim())
    .slice(0, 2)
    .map((k) => `${k.count} reviews mention ${k.name.trim().toLowerCase()}`);

  const like = likeLine(card.because);
  if (!note && !like && favorites.length === 0 && order.length === 0 && mentions.length === 0) return null;
  return {
    title: `Why ${client}`,
    ...(card.score !== undefined ? { score: card.score } : {}),
    ...(note ? { note } : {}),
    ...(like ? { like } : {}),
    favorites,
    order,
    mentions,
  };
}
