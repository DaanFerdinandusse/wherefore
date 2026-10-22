import { ensureDevTrip, linkNewChat } from "@/lib/agent/dev-setup";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";

// POST /chat-lab/new: a fresh chat on the dev trip, for the e2e tests and the
// lab's "New chat" button. Development only.
export async function POST() {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  try {
    const user = await requireUser();
    const { tripId } = await ensureDevTrip(user.userId);
    const chat = await linkNewChat(tripId, user.userId);
    return Response.json({ chatId: chat.id, tripId });
  } catch (error) {
    return errorResponse(error);
  }
}
