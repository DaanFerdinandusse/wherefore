import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import type { TripSwitcherItem } from "@/components/shell/trip-top-bar";
import { TripWorkspace } from "@/components/trip/workspace/trip-workspace";
import { datesLabel } from "@/components/trip/workspace/format";
import { paramsFromRecord, readUrlState } from "@/components/trip/workspace/url-state";
import { getTripChat, toChatSnapshot } from "@/lib/agent/chat-store";
import { requirePageUser, type AuthUser } from "@/lib/auth/server";
import type { ChatSnapshot } from "@/lib/contracts";
import { db } from "@/lib/db";
import { advisors } from "@/lib/db/schema";
import { getTripSnapshot, listTrips } from "@/lib/trips";
import type { TripCard } from "@/lib/trips/contracts";
import { DEV_TRIP_PREFIX, showDevTrips } from "@/lib/trips/dev";
import { shareUrl } from "@/lib/trips/share-actions";

// /trips/[tripId]: the trip workspace. Loads the snapshot, the chat row and
// the owner's other trips on the server, then hands them to the client
// workspace, which hydrates the store. A trip has several chats: `?chat=<id>`
// opens one of them, no param opens the most recently active one, and an id
// that is not one of the trip's chats redirects to the default. loading.tsx is the Suspense boundary
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

/** The chat in `?chat=` (or the trip's newest); undefined when that id is not one of the trip's chats. */
async function loadChat(
  trip: { id: string; chatId: string },
  chatParam: string | undefined,
  user: AuthUser,
): Promise<ChatSnapshot | undefined> {
  const row = await getTripChat(trip.id, chatParam, user);
  if (row) return toChatSnapshot(row);
  if (chatParam) return undefined;
  // A trip with no chat row (createTrip always makes one) opens an empty chat.
  return { chat: { id: trip.chatId, tripId: trip.id, status: "idle", messages: [] } };
}

/** The same URL without `?chat=`. */
function withoutChat(tripId: string, query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (key === "chat" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  const search = params.toString();
  return `/trips/${tripId}${search ? `?${search}` : ""}`;
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
  const chatParam = paramsFromRecord(query).get("chat") || undefined;
  const [chat, advisorName, origin] = await Promise.all([
    loadChat(snapshot.trip, chatParam, user),
    advisorDisplayName(user.userId),
    requestOrigin(),
  ]);
  if (!chat) redirect(withoutChat(snapshot.trip.id, query));

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
