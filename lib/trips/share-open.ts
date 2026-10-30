import "server-only";

import { headers } from "next/headers";
import { after } from "next/server";

import { getOptionalUser } from "@/lib/auth/server";

import { recordShareOpen } from "./mutations";
import { isPersonOpening } from "./share-open-rules";

// Called by the traveler page (app/s/[token]/load.ts) when a shared trip
// loads. The write runs after the response, so the page never waits on it
// and a failed write never breaks the page. Machines (link previews,
// prefetches) are skipped here; the trip's own advisor is skipped in SQL.

export async function noteShareOpen(token: string): Promise<void> {
  const h = await headers();
  const person = isPersonOpening({
    userAgent: h.get("user-agent"),
    purpose: h.get("sec-purpose") ?? h.get("purpose"),
    routerPrefetch: h.get("next-router-prefetch"),
  });
  if (!person) return;
  // Started now, while the request is in scope; awaited after the response.
  const viewer = getOptionalUser().catch(() => null);
  after(async () => {
    try {
      await recordShareOpen(token, await viewer);
    } catch (error) {
      console.error("Could not record the share link open", error);
    }
  });
}
