// Notes the model writes into itinerary slots (set_itinerary). They are
// stored as agent notes: the advisor sees them marked "Agent note", the
// traveler never sees them (note_for_traveler stays false and the tool can
// not set it). On top of that, a sentence that states opening hours, prices
// or a reservation is dropped unless it quotes a fact we hold for that place
// (its descriptions or its hours): the model must not invent those. Pure.

const HOURS = [
  /\b\d{1,2}(?:[:.]\d{2})?\s?(?:am|pm|h)\b/i,
  /\b\d{1,2}:\d{2}\b/,
  /\bopen(?:s|ing)?\b(?![-\s](?:air|kitchen|plan|terrace))/i,
  /\b(?:closes|closed|closing|close at|hours|midnight|late night)\b/i,
];
const PRICES = [
  /[$€£¥]/,
  /\b\d+\s?(?:eur|usd|gbp)\b/i,
  /\b(?:price|prices|priced|pricey|cost|costs|cheap|expensive|affordable|budget|euros?|dollars?|pounds?|per person)\b/i,
  /\bfree (?:entry|admission|of charge)\b/i,
];
const RESERVATIONS = [
  /\b(?:reserv\w*|book|booked|booking|bookings|table for|walk-?ins?|wait ?list|sold out|confirmed|hold(?:ing)? a table)\b/i,
];

export const MAX_AGENT_NOTE_CHARS = 200;

const normalize = (text: string) =>
  text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

/** Does a sentence state hours, a price or a reservation? */
export function makesClaim(sentence: string): boolean {
  return [...HOURS, ...PRICES, ...RESERVATIONS].some((pattern) => pattern.test(sentence));
}

/** Does the sentence quote one of the facts (or is it part of one)? */
function quotesFact(sentence: string, facts: readonly string[]): boolean {
  const text = normalize(sentence).replace(/[.!?]+$/, "");
  return facts.some((fact) => {
    const f = normalize(fact).replace(/[.!?]+$/, "");
    return f.length >= 8 && (text.includes(f) || f.includes(text));
  });
}

/**
 * The note as stored: dashes become commas, a claim about hours, prices or
 * reservations survives only when it quotes a provided fact, at most
 * MAX_AGENT_NOTE_CHARS. Empty when nothing is left.
 */
export function cleanAgentNote(note: string | undefined, facts: readonly string[]): string {
  if (!note) return "";
  const flat = note.replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ").trim();
  const sentences = flat.match(/[^.!?]+[.!?]*/g) ?? [];
  const kept = sentences
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && (!makesClaim(s) || quotesFact(s, facts)));
  const out = kept.join(" ").trim();
  return out.length > MAX_AGENT_NOTE_CHARS ? `${out.slice(0, MAX_AGENT_NOTE_CHARS - 1).trimEnd()}…` : out;
}
