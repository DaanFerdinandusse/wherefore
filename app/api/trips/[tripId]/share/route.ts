import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { createShareLink, stopSharing } from "@/lib/trips/share-actions";

// POST /api/trips/[tripId]/share : creates the traveler link (or returns the
// existing one) and answers { url }.
// DELETE /api/trips/[tripId]/share : stops sharing; answers 204.
// Both are scoped to the signed-in advisor; another advisor's trip is a 404.

type Context = { params: Promise<{ tripId: string }> };

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request, { params }: Context): Promise<Response> {
  try {
    const user = await requireUser();
    const { tripId } = await params;
    const { url } = await createShareLink(tripId, user, new URL(request.url).origin);
    return Response.json({ url }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  try {
    const user = await requireUser();
    const { tripId } = await params;
    await stopSharing(tripId, user);
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
