// Pure rules the demo seed applies to live results: does a search hit name
// the place we asked for, which locality candidate to keep, and the trip dates
// for the day the seed runs. No I/O, tested in rules.test.ts.

import type { LocalitySpec, TripDatesSpec } from "./data";

// ------------------------------------------------------------ name matching

/** Words that say what a place is, not which one it is. */
const GENERIC = new Set([
  "a",
  "and",
  "bar",
  "bistro",
  "cafe",
  "coffee",
  "company",
  "da",
  "das",
  "de",
  "del",
  "do",
  "dos",
  "el",
  "la",
  "le",
  "les",
  "lisboa",
  "o",
  "pastelaria",
  "restaurant",
  "restaurante",
  "the",
]);

/** Lowercase words without accents or punctuation: "Mel's Café" -> ["mels", "cafe"]. */
export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function distinctive(name: string): string[] {
  const tokens = nameTokens(name);
  const kept = tokens.filter((t) => !GENERIC.has(t));
  return kept.length > 0 ? kept : tokens;
}

/**
 * True when a search hit names the place we asked for: every distinctive word
 * of the query is in the hit ("Monmouth Coffee" finds "Monmouth Coffee
 * Company"), or every distinctive word of the hit is in the query ("Máximo
 * Bistrot" finds "Máximo"). "Pastelaria Alcôa" does not match "Pastelaria Careca".
 */
export function nameMatches(query: string, candidate: string): boolean {
  const queryAll = new Set(nameTokens(query));
  const candidateAll = new Set(nameTokens(candidate));
  if (queryAll.size === 0 || candidateAll.size === 0) return false;
  const queryInHit = distinctive(query).every((t) => candidateAll.has(t));
  const hitInQuery = distinctive(candidate).every((t) => queryAll.has(t));
  return queryInHit || hitInQuery;
}

// ---------------------------------------------------------------- localities

/** The candidate a locality spec asks for, else the first one. */
export function pickLocality<T extends { disambiguation: string }>(spec: LocalitySpec, candidates: T[]): T | undefined {
  const prefix = spec.disambiguationStartsWith;
  if (prefix) {
    const hit = candidates.find((c) => c.disambiguation.startsWith(prefix));
    if (hit) return hit;
  }
  return candidates[0];
}

// --------------------------------------------------------------------- dates

/** YYYY-MM-DD plus n days, in UTC. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isoDate(year: number, month: number, day: number): string {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

/** Start and end (YYYY-MM-DD) of a trip for a run on `today`. */
export function tripDates(spec: TripDatesSpec, today: string): { start: string; end: string } {
  const [year, month] = today.split("-").map(Number) as [number, number];
  switch (spec.kind) {
    case "fixed":
      return { start: spec.start, end: spec.end };
    case "next-month": {
      const start = isoDate(year, month + 1, spec.startDay);
      return { start, end: addDays(start, spec.nights) };
    }
    case "around-today":
      return { start: addDays(today, -spec.daysBefore), end: addDays(today, spec.daysAfter) };
    case "last-year": {
      const start = isoDate(year - 1, spec.month, spec.day);
      return { start, end: addDays(start, spec.nights) };
    }
  }
}

