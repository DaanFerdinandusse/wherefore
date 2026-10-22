import { errorResponse, NotFoundError } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { getTripSnapshot } from "@/lib/trips";

// GET /api/trips/<id>/snapshot: the workspace's refetch (the seed poll and any
// "reload the board" moment). Answers { snapshot } with the same shape the
// page hydrates the store from.

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }): Promise<Response> {
  try {
    const user = await requireUser();
    const { tripId } = await params;
    const snapshot = await getTripSnapshot(tripId, user);
    if (!snapshot) throw new NotFoundError("trip");
    return Response.json({ snapshot }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
