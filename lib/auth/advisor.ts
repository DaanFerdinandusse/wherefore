import "server-only";

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { advisors } from "@/lib/db/schema";

// The advisors row holds the workspace profile: display name, home city,
// and taste portrait. It is created on the first request.

export type Advisor = typeof advisors.$inferSelect;

export type AdvisorSeed = { userId: string; email: string; name: string };

/** The name we show for a new advisor: the auth name, else the email's local part. */
export function displayNameFor(user: Pick<AdvisorSeed, "email" | "name">): string {
  const name = user.name.trim();
  if (name) return name;
  return user.email.split("@")[0] || user.email;
}

/**
 * Insert the advisors row for this user if it does not exist and return it.
 * An existing row keeps its display name: the advisor may have edited it.
 * Idempotent and safe under concurrent first requests (`on conflict`).
 */
export async function ensureAdvisor(user: AdvisorSeed): Promise<Advisor> {
  const [row] = await db
    .insert(advisors)
    .values({ ownerId: user.userId, userId: user.userId, displayName: displayNameFor(user) })
    .onConflictDoUpdate({
      target: advisors.userId,
      // A no-op update so `returning` yields the existing row.
      set: { userId: sql`${advisors.userId}` },
    })
    .returning();
  if (!row) throw new Error("ensureAdvisor returned no row");
  return row;
}

/** The advisors row for a user; null before their first request. */
export async function getAdvisor(userId: string): Promise<Advisor | null> {
  const [row] = await db.select().from(advisors).where(eq(advisors.userId, userId)).limit(1);
  return row ?? null;
}

/** Writes the fields the My places rail and the home-city banner edit. */
export async function updateAdvisor(
  userId: string,
  patch: Partial<Pick<Advisor, "displayName" | "homeCity" | "tasteTags" | "blendMyTaste">>,
): Promise<Advisor | null> {
  const [row] = await db
    .update(advisors)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(eq(advisors.userId, userId))
    .returning();
  return row ?? null;
}
