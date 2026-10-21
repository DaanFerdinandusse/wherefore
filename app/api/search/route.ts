import { z } from "zod";

import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { appSearch } from "@/lib/search/app-search";

// GET /api/search?q=ana : the app bar's grouped dropdown.
// Answers { clients, trips, places }, each best match first.

const Query = z.object({ q: z.string().max(100).default("") });

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const parsed = Query.safeParse({ q: new URL(request.url).searchParams.get("q") ?? undefined });
    if (!parsed.success) {
      return Response.json(
        { error: { code: "invalid_input", message: "Search text is limited to 100 characters." } },
        { status: 400 },
      );
    }
    const results = await appSearch(user, parsed.data.q);
    return Response.json(results, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
