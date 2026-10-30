// The itinerary panel's model: which slots each day shows, what fills them,
// and every line of copy on a card. Pure, so it is tested without React.
// Every sentence is a code template over facts the API returned (dishes,
// review keywords with counts, favorite shares, shared taste tags) or the
// advisor's own notes. A template with no fact behind it returns nothing and
// the UI hides that element. Never model prose, never demo data.

import type { Ask, Category, ItinerarySlot, SlotName, TripPlaceCard, TripSnapshot } from "@/lib/contracts";
import { favoriteDrivers } from "@/lib/qloo/normalize";

import { SLOT_LABELS } from "../workspace/format";
import { compareSlots, dateOfDay, dayCount, nextFreeSlot, slotKey, SLOT_ORDER, type WorkspaceState } from "../workspace/reducer";

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
  return totalDays > 1 && day === totalDays ? ["morning", "lunch"] : ["morning", "lunch", "dinner"];
}

/** One slot of a day as the panel shows it. */
export type SlotView = {
  day: number;
  slot: SlotName;
  position: number;
  row?: ItinerarySlot;
  /** The place in the slot. */
  card?: TripPlaceCard;
  /** A search running in the chat for this slot ("Finding dinner in the chat"). */
  finding?: Ask;
  /** A place the chat suggested for this open slot. */
  suggestion?: TripPlaceCard;
};

export type DayView = {
  day: number;
  date?: string;
  slots: SlotView[];
  filled: number;
  /** The most common neighborhood of the day's places. */
  neighborhood?: string;
};

type ModelState = Pick<WorkspaceState, "trip" | "slots" | "places" | "asks" | "requestedDays" | "selectedPlaceId">;

/** The live asks with a target slot, keyed by slot: running ones only. */
export function findingBySlot(asks: Ask[], slots: ItinerarySlot[]): Map<string, Ask> {
  const filled = new Set(slots.filter((s) => s.tripPlaceId).map(slotKey));
  const out = new Map<string, Ask>();
  for (const ask of asks) {
    if (ask.status !== "running" || !ask.target) continue;
    const key = slotKey(ask.target);
    if (!filled.has(key)) out.set(key, ask);
  }
  return out;
}

const byScore = (a: TripPlaceCard, b: TripPlaceCard) => (b.score ?? -1) - (a.score ?? -1);

/**
 * The place suggested for each open slot. From an ask aimed at a slot: its
 * best place that is not in the itinerary or removed. Then the place open in
 * the chat (selected), for the next free slot that suits it, when no ask
 * already suggested something there.
 */
export function suggestionsBySlot(state: ModelState): Map<string, TripPlaceCard> {
  const filled = new Set(state.slots.filter((s) => s.tripPlaceId).map(slotKey));
  const places = Object.values(state.places);
  const out = new Map<string, TripPlaceCard>();
  const used = new Set<string>();
  for (const ask of Object.values(state.asks)) {
    if (!ask.target || ask.status === "archived" || ask.status === "failed") continue;
    const key = slotKey(ask.target);
    if (filled.has(key) || out.has(key)) continue;
    const candidates = places.filter((p) => p.status === "suggested" && p.askIds.includes(ask.id));
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
      const card = row.tripPlaceId ? state.places[row.tripPlaceId] : undefined;
      // A row without a place (a note on an open slot) still shows its slot.
      views.set(slotKey(row), { day, slot: row.slot, position: row.position, row, card: card?.status === "removed" ? undefined : card });
    }
    for (const [key, view] of views) {
      if (view.card) continue;
      const ask = finding.get(key);
      const suggestion = suggestions.get(key);
      if (ask) view.finding = ask;
      else if (suggestion) view.suggestion = suggestion;
    }
    const slots = [...views.values()].sort(
      (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.position - b.position,
    );
    const cards = slots.flatMap((s) => (s.card ? [s.card] : []));
    days.push({
      day,
      date: dateOfDay(state.trip, day),
      slots,
      filled: cards.length,
      neighborhood: mostCommon(cards.filter((c) => c.category !== "stay").map((c) => c.neighborhood)),
    });
  }
  return days;
}

/** The cards layout once two slots hold a place; before that, the slot lists of the brief (S1). */
export function usesCards(days: DayView[]): boolean {
  return days.reduce((n, d) => n + d.filled, 0) >= 2;
}

/** The day the brief layout opens: the first with a place, a search or a suggestion, else day 1. */
export function openDay(days: DayView[]): number {
  return days.find((d) => d.slots.some((s) => s.card || s.finding || s.suggestion))?.day ?? 1;
}

/** "Friday" and "Príncipe Real" for "Friday in Príncipe Real"; "Day 2" without dates. */
export function dayTitle(day: Pick<DayView, "day" | "date" | "neighborhood">): { lead: string; place?: string } {
  return { lead: day.date ? weekday(day.date) : `Day ${day.day}`, ...(day.neighborhood ? { place: day.neighborhood } : {}) };
}

/** "Day 1 · Arrival", "Day 3", "Day 5 · Departure". */
export function dayNote(day: number, total: number): string {
  if (total > 1 && day === 1) return "Day 1 · Arrival";
  if (total > 1 && day === total) return `Day ${day} · Departure`;
  return `Day ${day}`;
}

/** "Morning, lunch, dinner": the slots a collapsed day offers. */
export function slotList(slots: SlotName[]): string {
  const words = slots.map((s) => SLOT_LABELS[s].toLowerCase());
  const text = words.join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Open", "1 of 3 picked", "All picked". */
export function dayStatus(day: Pick<DayView, "filled" | "slots">): string {
  if (day.filled === 0) return "Open";
  if (day.filled >= day.slots.length) return "All picked";
  return `${day.filled} of ${day.slots.length} picked`;
}

/** "Finding dinner in the chat" */
export function findingLabel(slot: SlotName): string {
  return `Finding ${SLOT_LABELS[slot].toLowerCase()} in the chat`;
}

/** "Dinner is open" */
export function openLabel(slot: SlotName): string {
  return `${SLOT_LABELS[slot]} is open`;
}

/** "92 match. Add it from the card, or drag it here." Without a score, the action only. */
export function suggestionHint(card: Pick<TripPlaceCard, "score">): string {
  const action = "Add it from the card, or drag it here.";
  return typeof card.score === "number" ? `${Math.round(card.score)} match. ${action}` : action;
}

// ------------------------------------------------------------------ the cover and the brief

export type CoverFacts = { dates: string | null; travelers: string | null; stay: string | null; open: string | null };

/** The facts line under "Ana in Lisbon": dates and nights, who travels, where they stay, open slots. */
export function coverFacts(
  trip: Pick<TripSnapshot["trip"], "startDate" | "endDate">,
  travelers: Pick<TripSnapshot["travelers"][number], "name">[],
  days: DayView[],
): CoverFacts {
  const stay = days.flatMap((d) => d.slots).find((s) => s.slot === "stay" && s.card)?.card;
  const open = days.flatMap((d) => d.slots).filter((s) => !s.card && s.slot !== "stay").length;
  const names = travelers.map((t) => firstName(t.name)).filter(Boolean);
  return {
    dates: coverDates(trip.startDate, trip.endDate),
    travelers: names.length > 1 ? joinNames(names) : null,
    stay: stay ? `Staying at ${stay.name}` : null,
    open: open > 0 ? `${open} ${open === 1 ? "slot" : "slots"} open` : null,
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
      ? `Nothing picked yet: tell me what ${client} wants and I start with one slot.`
      : `${filled} of ${total} slots picked.`;
  return [`${who}.`, dates ? `${dates}.` : null, progress].filter(Boolean).join(" ");
}

// ------------------------------------------------------------------ a place card

/** The noun for the place's kind, from our category. */
export const CATEGORY_NOUN: Record<Category, string> = {
  eat: "Restaurant",
  drink: "Bar",
  coffee: "Coffee",
  see: "Sight",
  stay: "Hotel",
  other: "Place",
};

/** "Morning · Coffee": the chip on the photo. */
export function slotChip(slot: SlotName, category: Category): string {
  return `${SLOT_LABELS[slot]} · ${CATEGORY_NOUN[category]}`;
}

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

/** "Restaurant · Chiado · €€€" */
export function subLine(card: Pick<TripPlaceCard, "category" | "neighborhood" | "priceLevel">, countryCode?: string): string {
  return [CATEGORY_NOUN[card.category], card.neighborhood?.trim() || null, priceLabel(card.priceLevel, countryCode)]
    .filter(Boolean)
    .join(" · ");
}

/** The longest dish or keyword the photo headline takes. */
export const HEADLINE_MAX = 24;

/** Reviews mention a keyword this often before it can carry a headline or a Why line. */
export const KEYWORD_MIN_COUNT = 3;

function lower(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * The italic line on the photo. From the place's own top dish ("For the
 * oysters"), else the most mentioned review keyword ("Known for tinned
 * fish"), else the favorite most behind the pick ("Devoción fans come
 * here"). Null when there is no fact to say it from.
 */
export function headline(card: Pick<TripPlaceCard, "dishes" | "keywords" | "because">): string | null {
  // A long dish name does not fit on the photo; the next short one, or a keyword, does.
  const dish = card.dishes?.map((d) => d.trim()).find((d) => d.length > 0 && d.length <= HEADLINE_MAX);
  if (dish) return `For the ${lower(dish)}`;
  const keyword = card.keywords?.find((k) => k.count >= KEYWORD_MIN_COUNT && k.name.trim().length <= HEADLINE_MAX)?.name.trim();
  if (keyword) return `Known for ${lower(keyword)}`;
  const top = [...favoriteDrivers(card.because)].sort((a, b) => b.share - a.share)[0];
  if (top?.name) return `${top.name} fans come here`;
  return null;
}

/** What to order: the place's own specialty dishes, verbatim, up to three. */
export function orderItems(card: Pick<TripPlaceCard, "dishes">, limit = 3): string[] {
  return (card.dishes ?? []).map((d) => d.trim()).filter(Boolean).slice(0, limit);
}

export type WhyLine =
  | { kind: "keyword"; text: string }
  | { kind: "favorite"; text: string; entityId: string; imageUrl?: string }
  | { kind: "shares"; text: string };

export type WhyBox = {
  title: string;
  /** The advisor's own note, quoted. */
  note?: { text: string; label: string };
  lines: WhyLine[];
};

/**
 * The "Why Ana" box: the advisor's note on the slot (or on the saved place),
 * how many reviews mention the top keyword, the favorites behind the pick
 * with their shares, and the taste tags they share. Null when none exist.
 */
export function whyBox(
  card: Pick<TripPlaceCard, "keywords" | "because" | "sharedTags" | "yourPlace">,
  clientName: string,
  options: { slotNote?: Pick<ItinerarySlot, "note" | "noteSource">; favoriteImages?: Map<string, string> } = {},
): WhyBox | null {
  const client = firstName(clientName);
  const lines: WhyLine[] = [];

  const slotNote = options.slotNote?.noteSource !== "agent" ? options.slotNote?.note.trim() : "";
  const placeNote = card.yourPlace?.note.trim();
  const note = slotNote
    ? { text: slotNote, label: `Your note on ${client}` }
    : placeNote
      ? { text: placeNote, label: "Your note on this place" }
      : undefined;

  const keyword = card.keywords?.find((k) => k.count >= KEYWORD_MIN_COUNT);
  const drivers = [...favoriteDrivers(card.because)].sort((a, b) => b.share - a.share).filter((d) => d.share > 0).slice(0, 2);
  drivers.forEach((d, i) => {
    const imageUrl = options.favoriteImages?.get(d.entityId);
    lines.push({
      kind: "favorite",
      entityId: d.entityId,
      text: i === 0 ? `${d.name} fans go here, ${d.share}%` : `${d.name} fans too, ${d.share}%`,
      ...(imageUrl ? { imageUrl } : {}),
    });
  });
  if (keyword) {
    lines.push({
      kind: "keyword",
      text: `${keyword.count} ${keyword.count === 1 ? "review mentions" : "reviews mention"} ${lower(keyword.name)}`,
    });
  }
  const tags = card.sharedTags.map((t) => lower(t.name)).filter(Boolean).slice(0, 2);
  if (tags.length > 0) lines.push({ kind: "shares", text: `Shares: ${tags.join(", ")}` });

  if (!note && lines.length === 0) return null;
  return { title: `Why ${client}`, ...(note ? { note } : {}), lines };
}
