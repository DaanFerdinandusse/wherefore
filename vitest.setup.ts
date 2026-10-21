import { config } from "dotenv";

// Tests that touch the database read DATABASE_URL from .env.local (each
// worktree points at its own Neon branch).
config({ path: ".env.local" });
