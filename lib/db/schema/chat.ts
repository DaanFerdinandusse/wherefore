import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import type { AppUIMessage } from "@/lib/contracts";

// A trip has one or more chats (trips.chat_id is the first one). The full
// UIMessage[] transcript is overwritten on each save; the Workflow stream is
// the live log. See docs/PLAN.md section 6.
export const chats = pgTable(
  "chats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id").notNull(),
    ownerId: text("owner_id").notNull(),
    // The advisor's first message, cut to a short line. Set once, in the
    // statement that takes the first turn's lock; null until then.
    title: text("title"),
    // idle | running | failed
    status: text("status").notNull().default("idle"),
    // Client-minted idempotency key for the running turn; doubles as the lock.
    activeTurnId: text("active_turn_id"),
    // Workflow run id for the running turn.
    activeRunId: text("active_run_id"),
    stopRequestedAt: timestamp("stop_requested_at", { withTimezone: true }),
    lastError: text("last_error"),
    // A finished turn whose assistant message could not be saved: the run
    // whose stream still holds it. GET rebuilds the message from that stream
    // and clears these. Written before the turn's lock is released.
    pendingRunId: text("pending_run_id"),
    pendingTurnId: text("pending_turn_id"),
    pendingSince: timestamp("pending_since", { withTimezone: true }),
    messages: jsonb("messages").$type<AppUIMessage[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("chats_trip_idx").on(t.tripId), index("chats_owner_idx").on(t.ownerId)],
);

// One row per turn a chat accepted, so a turnId stays idempotent after the
// turn ends: a resubmit returns the recorded outcome instead of a new run.
// Written in the same statement that takes the chat's turn lock; finalized
// in the statement that releases it.
export const chatTurns = pgTable(
  "chat_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    runId: text("run_id"),
    // running | completed | stopped | failed
    status: text("status").notNull().default("running"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("chat_turns_turn_id_idx").on(t.turnId), index("chat_turns_chat_idx").on(t.chatId)],
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
  // Random token of the caller holding the refresh lease. The token write
  // and the release only apply while this still matches.
  refreshLeaseOwner: text("refresh_lease_owner"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
