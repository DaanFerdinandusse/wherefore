import { z } from "zod";

// Locality search for a client's home city (C1 field, C2 "Lives in"):
// /api/localities/search, validated. The city resolves to a point so the
// searches for places they love are biased to it.

export type HomeCity = { name: string; lat: number | null; lon: number | null };

const localitySchema = z.object({
  candidates: z.array(
    z.looseObject({ name: z.string(), disambiguation: z.string().optional(), lat: z.number(), lon: z.number() }),
  ),
});

export type Locality = z.infer<typeof localitySchema>["candidates"][number];

export const LOCALITY_MIN_QUERY = 2;
export const LOCALITY_DEBOUNCE_MS = 250;

export async function fetchLocalities(q: string, signal?: AbortSignal): Promise<Locality[]> {
  const response = await fetch(`/api/localities/search?${new URLSearchParams({ q })}`, { signal });
  if (!response.ok) return [];
  return preferCities(localitySchema.parse(await response.json()).candidates);
}

function parts(disambiguation: string | undefined): string[] {
  return (disambiguation ?? "").split(",").map((part) => part.trim()).filter(Boolean);
}

/**
 * The search lists a region before the city of the same name ("New York,
 * United States of America", the state, before "New York, New York, United
 * States of America"). A home city wants the city: a same-named candidate
 * that sits inside a top-level region of the same country moves above it.
 * Otherwise the provider's order stays ("Berlin, Deutschland" is the city).
 * Pure.
 */
export function preferCities<T extends { name: string; disambiguation?: string }>(candidates: readonly T[]): T[] {
  const out = [...candidates];
  for (let i = 0; i < out.length; i++) {
    const region = parts(out[i].disambiguation);
    if (region.length !== 2) continue;
    const country = region[1];
    const name = out[i].name.trim().toLowerCase();
    const cityIndex = out.findIndex((candidate, j) => {
      if (j <= i || candidate.name.trim().toLowerCase() !== name) return false;
      const inside = parts(candidate.disambiguation);
      return inside.length > 2 && inside[inside.length - 1] === country;
    });
    if (cityIndex === -1) continue;
    const [city] = out.splice(cityIndex, 1);
    out.splice(i, 0, city);
    i += 1;
  }
  return out;
}
