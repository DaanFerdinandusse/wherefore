import { z } from "zod";

import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { resolveLocality } from "@/lib/qloo";

// Destination picker: locality candidates with coordinates and the
// disambiguation line. Trips store the point and radius, never free text.
// GET /api/localities/search?q=
const querySchema = z.object({ q: z.string().trim().min(2).max(80) });

export async function GET(request: Request) {
  try {
    await requireUser();
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return Response.json({ error: "Type at least two characters to search." }, { status: 400 });
    }
    const { candidates } = await resolveLocality(parsed.data.q);
    return Response.json({ candidates });
  } catch (error) {
    return errorResponse(error);
  }
}
