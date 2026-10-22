import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import type { TripSwitcherItem } from "@/components/shell/trip-top-bar";
import { TripWorkspace } from "@/components/trip/workspace/trip-workspace";
import { datesLabel } from "@/components/trip/workspace/format";
import { paramsFromRecord, readUrlState } from "@/components/trip/workspace/url-state";
import { requirePageUser } from "@/lib/auth/server";
import type { ChatSnapshot } from "@/lib/contracts";
import { db } from "@/lib/db";
import { advisors, chats } from "@/lib/db/schema";
import { getTripSnapshot, listTrips } from "@/lib/trips";
import type { TripCard } from "@/lib/trips/contracts";
import { DEV_TRIP_PREFIX, showDevTrips } from "@/lib/trips/dev";
import { shareUrl } from "@/lib/trips/share-actions";

// /trips/[tripId]: the trip workspace. Loads the snapshot, the chat row and
// the owner's other trips on the server, then hands them to the client
// workspace, which hydrates the store. loading.tsx is the Suspense boundary
// for the session read. The share link is passed on its own: ShareButton
// refreshes the route after Share or Stop sharing, and the workspace keeps
// the store's token in step with it.

/** The name the traveler page shows as "Prepared by", as the shared view reads it. */
async function advisorDisplayName(userId: string): Promise<string | null> {
  const [row] = await db.select({ name: advisors.displayName }).from(advisors).where(eq(advisors.userId, userId)).limit(1);
  return row?.name?.trim() || null;
}

/** The request's own origin, for the link when APP_URL is not set. */
async function requestOrigin(): Promise<string | undefined> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return undefined;
  return `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}`;
}

async function loadChat(chatId: string, tripId: string): Promise<ChatSnapshot> {
  const empty: ChatSnapshot = { chat: { id: chatId, tripId, status: "idle", messages: [] } };
  if (!chatId) return empty;
  const [row] = await db
    .select({
      id: chats.id,
      tripId: chats.tripId,
      status: chats.status,
      activeRunId: chats.activeRunId,
      activeTurnId: chats.activeTurnId,
      lastError: chats.lastError,
      messages: chats.messages,
    })
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.tripId, tripId)))
    .limit(1);
  if (!row) return empty;
  return {
    chat: {
      id: row.id,
      tripId: row.tripId,
      status: row.status === "running" || row.status === "failed" ? row.status : "idle",
      activeRunId: row.activeRunId ?? undefined,
      activeTurnId: row.activeTurnId ?? undefined,
      lastError: row.lastError ?? undefined,
      messages: row.messages,
    },
  };
}

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ tripId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tripId }, query, user] = await Promise.all([params, searchParams, requirePageUser()]);
  const [snapshot, byStage, devByStage] = await Promise.all([
    getTripSnapshot(tripId, user),
    listTrips(user),
    showDevTrips() ? listTrips(user, { dev: "only" }) : Promise.resolve(null),
  ]);
  if (!snapshot) notFound();
  const [chat, advisorName, origin] = await Promise.all([
    loadChat(snapshot.trip.chatId, snapshot.trip.id),
    advisorDisplayName(user.userId),
    requestOrigin(),
  ]);

  // The switcher: the newest real trips, then (in development only) the dev trips in their own group.
  const switcherItems = (columns: typeof byStage | null, limit: number, dev: boolean): TripSwitcherItem[] =>
    Object.values(columns ?? {})
      .flatMap((column): TripCard[] => column.trips)
      .filter((t) => t.id !== snapshot.trip.id)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .slice(0, limit)
      .map((t) => ({
        id: t.id,
        title: dev ? t.title.slice(DEV_TRIP_PREFIX.length) : `${t.clientName} · ${t.destination.name}`,
        subtitle: datesLabel({ startDate: t.startDate ?? undefined, endDate: t.endDate ?? undefined }),
        href: `/trips/${t.id}`,
        imageSrc: t.imageUrl ?? undefined,
        ...(dev ? { dev: true } : {}),
      }));
  const otherTrips = [...switcherItems(byStage, 6, false), ...switcherItems(devByStage, 3, true)];

  return (
    <TripWorkspace
      snapshot={snapshot}
      chat={chat}
      otherTrips={otherTrips}
      userName={user.name || user.email}
      advisorName={advisorName ?? (user.name || null)}
      url={readUrlState(paramsFromRecord(query))}
      shareUrl={snapshot.trip.shareToken ? shareUrl(snapshot.trip.shareToken, origin) : undefined}
    />
  );
}
