"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

import { interleave, type SearchCandidate } from "@/lib/clients/candidates";

// Debounced entity search through /api/entities/search for the favorites
// picker and "Also into". One request per entity type (so every result knows
// its type), biased to the client's home city when it is known. Responses
// are validated; a stale response never overwrites a newer query.

export type EntityType = "place" | "artist" | "movie";
export type TypedCandidate = SearchCandidate & { type: EntityType };
export type SearchState = "idle" | "loading" | "done" | "error";

const DEBOUNCE_MS = 250;
export const MIN_QUERY = 2;
/** The picker's page size; the server action repeats it so its lookup is a cache hit. */
export const PICKER_TAKE = 5;

const responseSchema = z.object({
  candidates: z.array(
    z.looseObject({
      entityId: z.string(),
      name: z.string(),
      address: z.string().optional(),
      disambiguation: z.string().optional(),
      lat: z.number().optional(),
      lon: z.number().optional(),
      imageUrl: z.string().optional(),
    }),
  ),
});

type Near = { lat: number; lon: number } | null;

function searchUrl(q: string, type: EntityType, near: Near, take: number): string {
  const params = new URLSearchParams({ q, types: type, take: String(take) });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lon));
  }
  return `/api/entities/search?${params.toString()}`;
}

async function fetchType(q: string, type: EntityType, near: Near, take: number, signal: AbortSignal) {
  const response = await fetch(searchUrl(q, type, near, take), { signal });
  if (!response.ok) throw new Error(`search ${response.status}`);
  const { candidates } = responseSchema.parse(await response.json());
  return candidates.map(
    (c): TypedCandidate => ({
      entityId: c.entityId,
      name: c.name,
      ...(c.address ? { address: c.address } : {}),
      ...(c.disambiguation ? { disambiguation: c.disambiguation } : {}),
      ...(typeof c.lat === "number" && typeof c.lon === "number" ? { lat: c.lat, lon: c.lon } : {}),
      ...(c.imageUrl ? { imageUrl: c.imageUrl } : {}),
      type,
    }),
  );
}

export function useEntitySearch(
  query: string,
  { types, near, take = PICKER_TAKE }: { types: readonly EntityType[]; near: Near; take?: number },
): { results: TypedCandidate[]; state: SearchState } {
  const q = query.trim();
  const key = JSON.stringify([q, types, near, take]);
  const [answer, setAnswer] = useState<{ key: string; results: TypedCandidate[]; failed: boolean } | null>(null);

  useEffect(() => {
    if (q.length < MIN_QUERY) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const lists = await Promise.all(types.map((type) => fetchType(q, type, near, take, controller.signal)));
        setAnswer({ key, results: interleave(lists), failed: false });
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("[clients] entity search failed", error);
        setAnswer({ key, results: [], failed: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` covers q, types, near and take.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (q.length < MIN_QUERY) return { results: [], state: "idle" };
  // Never offer results of an older query: Enter would add the wrong place.
  if (!answer || answer.key !== key) return { results: [], state: "loading" };
  return { results: answer.results, state: answer.failed ? "error" : "done" };
}
