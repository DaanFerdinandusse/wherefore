// Fills one advisor's workspace with demo data: four clients with live
// resolved favorites and taste tags, 17 saved places in Lisbon and Mexico
// City, and one trip per stage. Every place is a real entity, looked up one
// request at a time (the upstream rate limits parallel bursts). Safe to run
// twice: rows that exist are kept. See docs/DEMO.md.
//
//   npx tsx --conditions=react-server scripts/seed-demo.ts --owner <authUserId> [--reset]
//   npx tsx --conditions=react-server scripts/seed-demo.ts --owner-email <email> [--reset]
//
// --conditions=react-server lets the server-only modules load outside Next.

import { config } from "dotenv";

import { ArgsError, USAGE, parseSeedArgs } from "./lib/args";
import { formatTable } from "./lib/table";

config({ path: ".env.local", quiet: true });

async function main(): Promise<number> {
  const args = parseSeedArgs(process.argv.slice(2));
  if (args.kind === "help") {
    console.log(USAGE);
    return 0;
  }
  const started = Date.now();

  // Imported after dotenv: lib/db reads DATABASE_URL when it loads.
  const { COUNTED_TABLES, countRows, findAuthUser, resetWorkspace } = await import("./lib/workspace");
  const { seedDemo } = await import("./lib/seed");

  const user = await findAuthUser(args.owner);
  console.log(`Owner ${user.email} (${user.id})`);

  if (args.reset) {
    const deleted = await resetWorkspace(user.id);
    console.log(
      `Reset: deleted ${deleted.trips} trips, ${deleted.clients} clients, ${deleted.advisorPlaces} saved places and their rows`,
    );
  }

  const before = await countRows(user.id);
  const report = await seedDemo({ id: user.id, email: user.email }, (line) => console.log(`  ${line}`));
  const after = await countRows(user.id);

  console.log("\nRows");
  console.log(
    formatTable(
      ["Table", "Before", "After", "New"],
      COUNTED_TABLES.map(([table, label]) => [label, before[table], after[table], after[table] - before[table]]),
    ),
  );

  console.log("\nTrips");
  console.log(
    formatTable(
      ["Trip", "Stage", "Dates", "Places", "Slots", "Seed", "Share link"],
      report.trips.map((t) => [
        t.title,
        t.stage,
        t.dates,
        t.places,
        t.slots,
        t.seedStatus,
        t.shareToken ? `/s/${t.shareToken}` : "",
      ]),
    ),
  );

  console.log("\nFavorites without a match");
  if (report.unmatchedFavorites.length === 0) console.log("  none");
  for (const f of report.unmatchedFavorites) {
    console.log(`  ${f.client}: "${f.query}" (candidates: ${f.candidates.join(", ") || "none"})`);
  }
  if (report.missingAdvisorPlaces.length > 0) {
    console.log("\nSaved places not found");
    for (const m of report.missingAdvisorPlaces) console.log(`  ${m.city}: ${m.name}`);
  }

  const created = COUNTED_TABLES.reduce((sum, [table]) => sum + after[table] - before[table], 0);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${created} new rows. ${report.calls.calls} API calls (${report.calls.cached} from cache). Took ${seconds} s.`,
  );
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    if (error instanceof ArgsError) {
      console.error(`${error.message}\n\n${USAGE}`);
      process.exit(2);
    }
    console.error(error instanceof Error && error.name === "OwnerNotFoundError" ? error.message : error);
    process.exit(1);
  });
