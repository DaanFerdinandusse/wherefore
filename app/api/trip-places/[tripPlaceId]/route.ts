import { NotFoundError, errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { loadTripPlaceProfile } from "@/lib/trips/profile-query";
import type { TripPlaceProfile } from "@/lib/trips/profile-types";

// The place profile's data: the card plus the place row the sheet needs, the
// advisor's saved row and the asks it belongs to. Scoped to the caller
// through the trip. Response type: TripPlaceProfile (lib/trips/profile-types.ts).

export async function GET(_request: Request, { params }: { params: Promise<{ tripPlaceId: string }> }) {
  try {
    const user = await requireUser();
    const { tripPlaceId } = await params;
    const profile: TripPlaceProfile | null = await loadTripPlaceProfile(tripPlaceId, user);
    if (!profile) throw new NotFoundError("trip place");
    return Response.json(profile, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
