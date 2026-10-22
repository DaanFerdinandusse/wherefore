import { notFound } from "next/navigation";
import { Suspense } from "react";

import { ChatDock } from "@/components/trip/chat";
import { loadChatSnapshot } from "@/lib/agent/chat-routes";
import { ensureDevTrip } from "@/lib/agent/dev-setup";
import { requireUser } from "@/lib/auth/server";

// Development page for the durable chat: mounts the dock on a fixed dev trip
// (created on first visit). ?chat=<id> opens a specific chat, which is how
// the e2e tests give each scenario its own chat. Not served in production.

type Props = { searchParams: Promise<{ chat?: string }> };

async function Lab({ searchParams }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const user = await requireUser();
  const { chat } = await searchParams;
  const chatId = chat ?? (await ensureDevTrip(user.userId)).chatId;
  const snapshot = await loadChatSnapshot(chatId, user).catch(() => undefined);
  if (!snapshot) notFound();
  return (
    <ChatDock
      key={chatId}
      chatId={chatId}
      initial={snapshot}
      className="h-[calc(100dvh-7rem)] w-full max-w-[440px]"
    />
  );
}

export default function ChatLabPage(props: Props) {
  return (
    <main className="flex min-h-dvh flex-col items-center gap-4 bg-canvas p-6">
      <h1 className="label-caps text-text-2">Chat lab</h1>
      <Suspense fallback={<p className="text-text-2">Loading the chat</p>}>
        <Lab {...props} />
      </Suspense>
    </main>
  );
}
