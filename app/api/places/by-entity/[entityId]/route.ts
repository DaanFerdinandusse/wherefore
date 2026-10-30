import { NotFoundError, errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { loadFavoritePlace } from "@/lib/trips/profile-query";
import type { FavoritePlace } from "@/lib/trips/profile-types";

// A client favorite, opened from a "Why Ana" list. `places` is a shared cache
// that nobody owns, so this needs a signed-in user and no trip. An artist or
// film has no row and answers 404. Response type: FavoritePlace.

export async function GET(_request: Request, { params }: { params: Promise<{ entityId: string }> }) {
  try {
    await requireUser();
    const { entityId } = await params;
    const favorite: FavoritePlace | null = await loadFavoritePlace(entityId);
    if (!favorite) throw new NotFoundError("place");
    return Response.json(favorite, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
