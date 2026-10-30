import { nameMatches, nameTokens } from "@/lib/demo/rules";

// Finding a trip place by name: the model loses ids when old tool results are
// trimmed from its history (history.ts), and the advisor speaks in names
// anyway. Pure. A name that fits several places is never settled here: which
// one it is stays the advisor's call.

/**
 * The places a name could mean: those with exactly that name when there are
 * any, else the loose matches ("Cura" finds "Restaurante Cura").
 */
export function placesNamed<T extends { name: string }>(query: string, rows: readonly T[]): T[] {
  const wanted = nameTokens(query).join(" ");
  const exact = rows.filter((r) => nameTokens(r.name).join(" ") === wanted);
  return exact.length > 0 ? exact : rows.filter((r) => nameMatches(query, r.name));
}

export type NamedPlace<T> = { place: T; matches?: undefined } | { place?: undefined; matches: string[] };

/**
 * One place by name, or every name it could mean. Places still on the trip
 * come first; a removed one is found so the tool can say so, and so a retried
 * step resumes. Undefined when nothing fits.
 */
export function findNamedPlace<T extends { name: string; removed: boolean }>(
  query: string,
  rows: readonly T[],
): NamedPlace<T> | undefined {
  const live = placesNamed(query, rows.filter((r) => !r.removed));
  const found = live.length > 0 ? live : placesNamed(query, rows.filter((r) => r.removed));
  if (found.length > 1) return { matches: found.map((r) => r.name) };
  return found[0] ? { place: found[0] } : undefined;
}

/** The error for a name that fits several places, in the words the model repeats to the advisor. */
export function severalPlacesError(query: string, matches: readonly string[]): string {
  return `More than one place on this trip matches "${query}": ${matches.slice(0, 5).join(", ")}. Say which one.`;
}
