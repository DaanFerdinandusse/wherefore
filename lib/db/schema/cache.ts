import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Response cache for the recommendation API. Key is a hash of endpoint plus
// sorted params. Cold combinations upstream take 8 to 10 s, so cache
// insights for 24 h, search for 7 d, entities for 30 d.
export const apiCache = pgTable(
  "api_cache",
  {
    key: text("key").primaryKey(),
    endpoint: text("endpoint").notNull(),
    body: jsonb("body").$type<unknown>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("api_cache_expires_idx").on(t.expiresAt)],
);
