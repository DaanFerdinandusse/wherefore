import type { NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/server";
import { fetchPhoto } from "@/lib/google";
import { googleErrorResponse } from "@/lib/google/http";

// Google photo proxy: GET /api/places/photo?name=places/.../photos/...&w=800.
// Keeps the server key off the client and lets the browser cache the bytes for
// an hour. Width is capped at 2400 px, the body is streamed through (never
// buffered) and refused above 4 MB. Photo names are passed through, never stored.

export async function GET(request: NextRequest) {
  await requireUser();
  const name = request.nextUrl.searchParams.get("name");
  if (!name) return Response.json({ error: "Add the photo name as ?name=." }, { status: 400 });
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
