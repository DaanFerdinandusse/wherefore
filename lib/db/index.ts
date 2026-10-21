import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// HTTP driver: one round trip per query, no interactive transactions.
// Use db.batch([...]) when several writes must land together.
const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle({ client: sql, schema });
export type Db = typeof db;
export { schema };
