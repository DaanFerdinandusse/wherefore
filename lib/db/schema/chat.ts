import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import type { AppUIMessage } from "@/lib/contracts";

// One chat per trip. The full UIMessage[] transcript is overwritten on each
// save; the Workflow stream is the live log. See docs/PLAN.md section 6.
export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull(),
    ownerId: text("owner_id").notNull(),
    // idle | running | failed
    status: text("status").notNull().default("idle"),
    // Client-minted idempotency key for the running turn; doubles as the lock.
    activeTurnId: text("active_turn_id"),
    // Workflow run id for the running turn.
    activeRunId: text("active_run_id"),
    stopRequestedAt: timestamp("stop_requested_at", { withTimezone: true }),
    lastError: text("last_error"),
    messages: jsonb("messages").$type<AppUIMessage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chats_trip_idx").on(t.tripId), index("chats_owner_idx").on(t.ownerId)],
);

// The app's ChatGPT subscription tokens. One row ("default"). Tokens are
// encrypted with CODEX_TOKEN_KEY (AES-GCM). See docs/PLAN.md section 6.3.
export const codexCredentials = pgTable("codex_credentials", {
  id: text("id").primaryKey().default("default"),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accountId: text("account_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastRefresh: timestamp("last_refresh", { withTimezone: true }),
  refreshLeaseUntil: timestamp("refresh_lease_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
