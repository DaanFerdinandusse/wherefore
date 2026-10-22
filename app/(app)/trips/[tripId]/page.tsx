import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import type { TripSwitcherItem } from "@/components/shell/trip-top-bar";
import { TripWorkspace } from "@/components/trip/workspace/trip-workspace";
import { datesLabel } from "@/components/trip/workspace/format";
import { paramsFromRecord, readUrlState } from "@/components/trip/workspace/url-state";
import { requirePageUser } from "@/lib/auth/server";
import type { ChatSnapshot } from "@/lib/contracts";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { getTripSnapshot, listTrips } from "@/lib/trips";

// /trips/[tripId]: the trip workspace. Loads the snapshot, the chat row and
// the owner's other trips on the server, then hands them to the client
// workspace, which hydrates the store. loading.tsx is the Suspense boundary
// for the session read.

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
  const [snapshot, byStage] = await Promise.all([getTripSnapshot(tripId, user), listTrips(user)]);
  if (!snapshot) notFound();
  const chat = await loadChat(snapshot.trip.chatId, snapshot.trip.id);

  const otherTrips: TripSwitcherItem[] = Object.values(byStage)
    .flat()
    .filter((t) => t.id !== snapshot.trip.id)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: `${t.clientName} · ${t.destination.name}`,
      subtitle: datesLabel({ startDate: t.startDate ?? undefined, endDate: t.endDate ?? undefined }),
      href: `/trips/${t.id}`,
      imageSrc: t.imageUrl ?? undefined,
    }));

  return (
    <TripWorkspace
      snapshot={snapshot}
      chat={chat}
      otherTrips={otherTrips}
      userName={user.name || user.email}
      url={readUrlState(paramsFromRecord(query))}
    />
  );
}
