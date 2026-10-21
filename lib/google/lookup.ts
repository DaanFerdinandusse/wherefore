import "server-only";

// Resolves the app's place row id (places.id, what cards carry as `placeId`)
// to its Google place id. One read; belongs in lib/places/queries.ts once that
// module lands, and the route can import it from there instead.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { places } from "@/lib/db/schema/core";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPlaceRowId(value: string): boolean {
  return UUID_RE.test(value);
}

/** The Google place id stored on a places row, or null when there is none. */
export async function googlePlaceIdForRow(placeRowId: string): Promise<string | null> {
  const rows = await db
    .select({ googlePlaceId: places.googlePlaceId })
    .from(places)
    .where(eq(places.id, placeRowId))
    .limit(1);
  return rows[0]?.googlePlaceId ?? null;
}
