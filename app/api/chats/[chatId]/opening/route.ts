import { loadChatOpening } from "@/lib/agent/opening-data";
import { chatRoute } from "@/lib/agent/route-handler";

// GET /api/chats/[chatId]/opening: the first message of an empty chat,
// composed in code from the trip's facts (no model run, no search).
// → ChatOpening { created, createdFrom, paragraphs, placeholder }
export const GET = chatRoute(async ({ chatId, user }) => {
  const opening = await loadChatOpening(chatId, user);
  return Response.json(opening, { headers: { "cache-control": "no-store" } });
});
