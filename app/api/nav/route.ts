import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { navSummary } from "@/lib/trips/nav";

// GET /api/nav : what the nav drawer lists when it opens. Trips in progress,
// the most recent trips that are not done, and each trip's chats.
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return Response.json(await navSummary(user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
