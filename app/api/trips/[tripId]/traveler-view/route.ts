import { errorResponse, NotFoundError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { getTripTravelerView } from "@/lib/trips";

// GET /api/trips/<id>/traveler-view: what the workspace's traveler view shows.
// Answers { view }, the same view /s/[token] renders, with or without a share
// link. Opening it is not a traveler opening the link, so it never counts as one.

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { tripId } = await params;
    const view = await getTripTravelerView(tripId, user);
    if (!view) throw new NotFoundError("trip");
    return Response.json({ view }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
