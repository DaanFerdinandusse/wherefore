import { z } from "zod";

import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { advisorPlacesByEntityIds } from "@/lib/places/queries";

// Which search results the advisor already saved, so "Save a place" can say
// "Already in your places". GET /api/advisor-places?entityIds=a,b,c
// answers { saved: { [entityId]: { id, city } } }.
const querySchema = z.object({
  entityIds: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().max(120)).min(1).max(25)),
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) {
      return Response.json({ error: "Pass up to 25 entity ids as ?entityIds=." }, { status: 400 });
    }
    const saved = await advisorPlacesByEntityIds(user, parsed.data.entityIds);
    return Response.json({ saved });
  } catch (error) {
    return errorResponse(error);
  }
}
