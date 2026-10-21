import { config } from "dotenv";

// Database tests run real queries against the Neon branch in .env.local.
// Without DATABASE_URL they skip (see `hasDatabase`), so pure tests still run.
config({ path: ".env.local", quiet: true });
