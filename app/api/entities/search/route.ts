import { z } from "zod";

import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { searchEntities } from "@/lib/qloo";

// Shared entity search for the favorites picker, the My places "Save a
// place" field and the agent's named lookups. GET /api/entities/search?q=
// &types=place|artist|movie|book&lat=&lon=&take=
const querySchema = z.object({
  q: z.string().trim().min(2).max(120),
  types: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",") : ["place"]))
    .pipe(z.array(z.enum(["place", "artist", "movie", "book"])).min(1)),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  take: z.coerce.number().int().min(1).max(10).default(5),
});

export async function GET(request: Request) {
  try {
    await requireUser();
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = querySchema.safeParse(params);
    if (!parsed.success) {
      return Response.json({ error: "Type at least two characters to search." }, { status: 400 });
    }
    const { q, types, lat, lon, take } = parsed.data;
    const near = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    const { candidates } = await searchEntities(q, {
      types: types.map((t) => `urn:entity:${t}`),
      take,
      ...(near ? { near } : {}),
    });
    return Response.json({ candidates });
  } catch (error) {
    return errorResponse(error);
  }
}
