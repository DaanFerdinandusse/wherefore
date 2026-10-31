import { ChatRouteError } from "@/lib/agent/chat-routes";
import { lastExchangeSchema } from "@/lib/agent/next-prompt";
import { loadNextPrompts } from "@/lib/agent/next-prompt-data";
import { chatRoute } from "@/lib/agent/route-handler";

// POST /api/chats/[chatId]/next-prompt: the pills the composer offers after a
// reply, from one model call outside the turn. The client sends the last
// exchange, so the call need not wait for the reply to be saved.
// Body { ask, reply, earlier? } → { prompts: { label, prompt }[] }
export const POST = chatRoute(async ({ request, chatId, user }) => {
  const parsed = lastExchangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new ChatRouteError("bad_request:chat", 400, "The last reply could not be read.");
  const prompts = await loadNextPrompts(chatId, parsed.data, user, request.signal);
  return Response.json({ prompts }, { headers: { "cache-control": "no-store" } });
});
