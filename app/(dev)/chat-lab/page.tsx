import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ChatColumn } from "@/components/trip/chat";
import { TripStoreProvider } from "@/components/trip/store";
import { paramsFromRecord, readUrlState } from "@/components/trip/workspace/url-state";
import { loadChatSnapshot } from "@/lib/agent/chat-routes";
import { ensureDevTrip } from "@/lib/agent/dev-setup";
import { requireUser } from "@/lib/auth/server";
import { getTripSnapshot } from "@/lib/trips";

// Development page for the durable chat: mounts the v3 chat column on a
// fixed dev trip (created on first visit), inside the trip store like the
// workspace does, at the column's real width. ?chat=<id> opens a specific
// chat, which is how the e2e tests give each scenario its own chat; ?place=
// opens a place card over the thread. Not served in production.

type Query = Record<string, string | string[] | undefined>;
type Props = { searchParams: Promise<Query> };

async function Lab({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const user = await requireUser();
  const query = await searchParams;
  const chatParam = typeof query.chat === "string" ? query.chat : undefined;
  const chatId = chatParam ?? (await ensureDevTrip(user.userId)).chatId;
  const snapshot = await loadChatSnapshot(chatId, user).catch(() => undefined);
  if (!snapshot) notFound();
  const trip = await getTripSnapshot(snapshot.chat.tripId, user);
  if (!trip) notFound();
  return (
    <TripStoreProvider snapshot={trip} url={readUrlState(paramsFromRecord(query))}>
      <div className="h-full w-[720px] max-w-full">
        <ChatColumn key={chatId} chatId={chatId} tripId={snapshot.chat.tripId} initial={snapshot} />
      </div>
    </TripStoreProvider>
  );
}

export default function ChatLabPage(props: Props) {
  return (
    <main className="flex h-dvh flex-col items-center gap-2 overflow-hidden bg-canvas px-4 pt-3">
      <h1 className="label-caps shrink-0 text-text-2">Chat lab</h1>
      <div className="flex min-h-0 w-full flex-1 justify-center">
        <Suspense fallback={<p className="text-text-2">Loading the chat</p>}>
          <Lab {...props} />
        </Suspense>
      </div>
    </main>
  );
}
