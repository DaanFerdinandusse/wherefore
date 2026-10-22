import { createDevSeedTrip, devTripState } from "@/lib/agent/tools/dev-fixtures";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";

// Development only, for e2e/chat/tools.spec.ts.
// POST /chat-lab/seed-trip: a client with the demo favorites, three saved
//   places in Lisbon and a fresh Lisbon trip with its chat.
// GET /chat-lab/seed-trip?trip=<id>: seed status, places per category, asks.

export async function POST() {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  try {
    const user = await requireUser();
    return Response.json(await createDevSeedTrip(user.userId));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  try {
    const user = await requireUser();
    const tripId = new URL(request.url).searchParams.get("trip") ?? "";
    const state = await devTripState(user.userId, tripId);
    return state ? Response.json(state) : new Response(null, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
