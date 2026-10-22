import { healChat, loadOwnedChat } from "@/lib/agent/chat-routes";
import { toChatSnapshot } from "@/lib/agent/chat-store";
import { chatRoute } from "@/lib/agent/route-handler";

// GET /api/chats/[chatId]: rehydrate. Heals a stale lock on the way.
// → { chat: { id, tripId, status, activeRunId, activeTurnId, lastError, messages } }
export const GET = chatRoute(async ({ chatId, user }) => {
  const row = await healChat(await loadOwnedChat(chatId, user));
  return Response.json(toChatSnapshot(row), { headers: { "cache-control": "no-store" } });
});
