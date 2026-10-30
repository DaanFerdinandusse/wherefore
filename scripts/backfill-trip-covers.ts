// Gives trips from before covers their destination's Unsplash photo. Looks up
// each destination once and leaves updated_at alone, so the board keeps its
// order. Run it again after a rate limit: it only touches trips without a cover.
//
//   npx tsx --conditions=react-server scripts/backfill-trip-covers.ts
//
// Runs with --conditions=react-server so the server-only guard resolves to its
// empty build.

import { config } from "dotenv";
import { and, inArray, isNull } from "drizzle-orm";

config({ path: ".env.local", quiet: true });

async function main() {
  // Imported after dotenv so lib/db sees DATABASE_URL at module load.
  const { db } = await import("../lib/db");
  const { trips } = await import("../lib/db/schema");
  const { findCoverPhoto, markCoverPhotoUsed } = await import("../lib/unsplash");

  const rows = await db.select({ id: trips.id, destination: trips.destination }).from(trips).where(isNull(trips.cover));
  const byDestination = new Map<string, string[]>();
  for (const row of rows) {
    const ids = byDestination.get(row.destination.name) ?? [];
    byDestination.set(row.destination.name, [...ids, row.id]);
  }

  for (const [destination, ids] of byDestination) {
    const photo = await findCoverPhoto(destination);
    if (!photo) {
      console.log(`${destination}: no photo, ${ids.length} trips keep their place photo`);
      continue;
    }
    await db
      .update(trips)
      .set({ cover: photo.cover })
      .where(and(inArray(trips.id, ids), isNull(trips.cover)));
    await markCoverPhotoUsed(photo.downloadLocation);
    console.log(`${destination}: ${ids.length} trips, photo by ${photo.cover.creditName}`);
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
