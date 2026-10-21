import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { type DetailsTier, placeDetails } from "@/lib/google";
import { googleErrorResponse } from "@/lib/google/http";
import { googlePlaceIdForRow, isPlaceRowId } from "@/lib/google/lookup";

// Google details for the place profile. `placeId` is either the app's place row
// id (a uuid, what cards carry) or a Google place id. ?tier=basic (default)
// when the profile opens, ?tier=full when its ratings section scrolls in.
// Nothing from Google is stored; the answer is cached privately for 5 minutes.

export async function GET(request: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  await requireUser();
  const { placeId } = await params;

  const tierParam = request.nextUrl.searchParams.get("tier") ?? "basic";
  if (tierParam !== "basic" && tierParam !== "full") {
    return Response.json({ error: "Use tier=basic or tier=full." }, { status: 400 });
  }
  const tier: DetailsTier = tierParam;

  const googlePlaceId = isPlaceRowId(placeId) ? await googlePlaceIdForRow(placeId) : placeId;
  if (!googlePlaceId) {
    return Response.json({ error: "This place has no Google listing linked." }, { status: 404 });
  }

  try {
    const details = await placeDetails(googlePlaceId, tier);
    return Response.json(details, { headers: { "Cache-Control": "private, max-age=300" } });
  } catch (error) {
    return googleErrorResponse(error);
  }
}
