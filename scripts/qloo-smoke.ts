// Live smoke test for the recommendation client. Resolves Lisbon, resolves test
// client A's four favorites, runs findPlaces and prints the top 5 with scores
// and drivers. Exits non-zero on any failure. Calls are sequential (rate limits).
//
//   npx tsx --conditions=react-server scripts/qloo-smoke.ts
//
// --conditions=react-server lets the server-only modules load outside Next.

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

type Check = { ok: boolean; label: string };
const checks: Check[] = [];
function check(ok: boolean, label: string) {
  checks.push({ ok, label });
  if (!ok) console.error(`  FAIL ${label}`);
}

// Test client A (QLOO_API_FINDINGS.md), searched near their home city.
const FAVORITES = ["Via Carota", "Lilia", "Death & Co East Village", "Ace Hotel New York"];
const NEW_YORK = { lat: 40.73, lon: -73.99 };

async function main() {
  const { explainabilityFor, findPlaces, resolveLocality, searchEntities, tastePortrait, sharedTagsFor } =
    await import("@/lib/qloo");
  const allCalls: { endpoint: string; count: number; ms: number; cached: boolean }[] = [];

  console.log("1. resolveLocality(\"Lisbon\")");
  const locality = await resolveLocality("Lisbon");
  allCalls.push(...locality.calls);
  for (const c of locality.candidates.slice(0, 3)) {
    console.log(`   ${c.name} | ${c.disambiguation} | ${c.lat.toFixed(4)},${c.lon.toFixed(4)} | r=${c.radiusM} m | ${c.countryCode ?? "?"}`);
  }
  const lisbon = locality.candidates.find((c) => c.countryCode === "PT");
  check(Boolean(lisbon), "a Lisbon candidate in Portugal");
  if (!lisbon) return;

  console.log("2. searchEntities for client A's favorites near New York");
  const favorites: { entityId: string; name: string }[] = [];
  for (const query of FAVORITES) {
    const { candidates, calls } = await searchEntities(query, { types: "urn:entity:place", near: NEW_YORK, take: 3 });
    allCalls.push(...calls);
    const top = candidates[0];
    check(Boolean(top && top.name.toLowerCase().includes(query.toLowerCase().split(" ")[0])), `favorite "${query}" resolved`);
    if (top) {
      favorites.push({ entityId: top.entityId, name: top.name });
      console.log(`   ${query} -> ${top.name} (${top.address ?? "no address"}) ${top.entityId}`);
    }
  }

  console.log("3. findPlaces in Lisbon, take 10");
  const destination = {
    name: lisbon.name,
    disambiguation: lisbon.disambiguation,
    countryCode: lisbon.countryCode,
    lat: lisbon.lat,
    lon: lisbon.lon,
    radiusM: lisbon.radiusM,
    localityEntityId: lisbon.entityId,
  };
  const found = await findPlaces({ destination, signals: favorites.map((f) => f.entityId), take: 10 });
  allCalls.push(...found.calls);
  console.log(`   locality: requested "${found.localityCheck.requested}", resolved "${found.localityCheck.resolved}", ok=${found.localityCheck.ok}`);
  console.log(`   loosened: [${found.loosened.join(", ")}]`);
  check(found.results.length >= 5, "at least 5 results");
  check(found.localityCheck.ok, "results are in the destination");

  const portrait = await tastePortrait(favorites.map((f) => f.entityId));
  allCalls.push(...portrait.calls);
  console.log(`   taste portrait: ${portrait.tags.map((t) => t.name).join(", ")}`);

  console.log("   top 5:");
  for (const [i, r] of found.results.slice(0, 5).entries()) {
    const because = explainabilityFor(r, favorites);
    const shared = sharedTagsFor(r.place, portrait.tags).slice(0, 4);
    const sum = because.reduce((s, b) => s + b.share, 0);
    check(because.length > 0 && sum === 100, `${r.place.name}: shares sum to 100`);
    check(Boolean(r.place.googlePlaceId), `${r.place.name}: has a Google place id`);
    console.log(
      `   ${i + 1}. ${r.place.name} [${r.category}] score ${r.score} (affinity ${r.affinity.toFixed(4)}), ${r.place.neighborhood ?? r.place.city ?? ""}`,
    );
    console.log(`      because: ${because.map((b) => `${b.name} ${b.share}%`).join(", ")}`);
    console.log(`      shared tags: ${shared.map((t) => t.name).join(", ") || "none"}`);
  }

  console.log("4. calls");
  for (const c of allCalls) console.log(`   ${c.endpoint} count=${c.count} ${c.ms} ms cached=${c.cached}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    checks.push({ ok: false, label: "threw" });
  })
  .finally(() => {
    const failed = checks.filter((c) => !c.ok);
    console.log(failed.length === 0 ? `OK, ${checks.length} checks passed` : `${failed.length} of ${checks.length} checks failed`);
    process.exit(failed.length === 0 ? 0 : 1);
  });
