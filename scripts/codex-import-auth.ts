// Imports the Codex CLI's ChatGPT subscription tokens into the
// codex_credentials row "default", encrypted with CODEX_TOKEN_KEY.
//
//   npm run codex:import                 # reads ~/.codex/auth.json
//   npm run codex:import -- path/to.json # another auth file
//
// Runs with --conditions=react-server so the server-only guard in lib/db
// resolves to its empty build. Prints no token values.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function main() {
  const path = process.argv[2] ?? join(homedir(), ".codex", "auth.json");
  // Imported after dotenv so lib/db sees DATABASE_URL at module load.
  const { parseCodexAuthJson } = await import("../lib/codex/auth-json");
  const { saveCodexCredential, describeCodexCredential } = await import("../lib/codex/token-store");

  const auth = parseCodexAuthJson(await readFile(path, "utf8"));
  await saveCodexCredential(auth);
  const stored = await describeCodexCredential();
  if (!stored.connected) throw new Error("The credential row was not written");

  const minutes = Math.round((stored.expiresAt.getTime() - Date.now()) / 60_000);
  console.log(`Imported ${path}`);
  console.log(`Account ${stored.accountId.slice(0, 8)}..., access token expires in ${minutes} min`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
