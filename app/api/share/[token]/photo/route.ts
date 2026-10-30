import type { NextRequest } from "next/server";

import { fetchPhoto, photoPlaceId } from "@/lib/google";
import { googleErrorResponse } from "@/lib/google/http";
import { isSharedGooglePlace } from "@/lib/trips";

// A shared trip's Google photos: GET /api/share/<token>/photo?name=...&w=800.
// Public, because a traveler has no session for /api/places/photo, so it only
// serves photos of places on the itinerary behind an active share token. Any
// other photo is a 404, and a revoked link stops working (browsers may keep a
// photo for the hour it is cached). Otherwise it works like the proxy: the
// server key stays here and the bytes are streamed, never stored.

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const name = request.nextUrl.searchParams.get("name") ?? "";
  const placeId = photoPlaceId(name);
  if (!placeId || !(await isSharedGooglePlace(token, placeId))) {
    return Response.json({ error: "This photo is not part of a shared trip." }, { status: 404 });
  }
  const width = Number(request.nextUrl.searchParams.get("w") ?? undefined);

  try {
    const photo = await fetchPhoto(name, Number.isFinite(width) ? width : undefined);
    return new Response(photo.body, {
      headers: { "Content-Type": photo.contentType, "Cache-Control": "public, max-age=3600" },
    });
  } catch (error) {
    return googleErrorResponse(error);
  }
}
