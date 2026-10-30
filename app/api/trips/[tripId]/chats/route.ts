import { createTripChat, listTripChats } from "@/lib/agent/chat-store";
import { errorResponse, NotFoundError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { getTrip } from "@/lib/trips";
import { toNavChat } from "@/lib/trips/nav-chats";

// GET /api/trips/<id>/chats: the trip's chats, newest first, as
// { chats: NavChat[] }.
// POST /api/trips/<id>/chats: a new empty chat for the trip, as
// { chat: NavChat }. An empty chat the trip already has is reused, so a
// double click never makes two. The client opens /trips/<id>?chat=<chat.id>.

type Params = { params: Promise<{ tripId: string }> };

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const { tripId } = await params;
    if (!(await getTrip(tripId, user))) throw new NotFoundError("trip");
    const chats = await listTripChats(tripId, user);
    return Response.json({ chats: chats.map(toNavChat) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: Request, { params }: Params): Promise<Response> {
  try {
    const user = await requireUser();
    const { tripId } = await params;
    const chat = await createTripChat(tripId, user);
    if (!chat) throw new NotFoundError("trip");
    return Response.json({ chat: toNavChat(chat) }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
