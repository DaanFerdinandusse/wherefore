import { createTripRequestSchema, type CreateTripResponse } from "@/components/new-trip/request";
import { errorResponse } from "@/lib/auth/errors";
import { requireUser } from "@/lib/auth/server";
import { createTrip, type TravelerInput } from "@/lib/trips";

// Create a trip from the New trip panel: POST /api/trips with the body in
// components/new-trip/request.ts. Inserts the trip, its chat and its
// travelers in one batch (the client first, driving the search; then the
// guests). Companions without a profile are kept as travelers so the first
// list can say whose taste is missing. Answers 201 with the trip id.
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const json: unknown = await request.json().catch(() => null);
    const parsed = createTripRequestSchema.safeParse(json);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "Check the trip details and try again.";
      return Response.json({ error: { code: "invalid_input", message } }, { status: 400 });
    }
    const body = parsed.data;

    const guests: TravelerInput[] = body.guests
      .filter((g) => g.clientId !== body.clientId)
      .map((g) => ({ clientId: g.clientId ?? null, name: g.name, role: "guest", drivesSearch: Boolean(g.clientId) }));

    const created = await createTrip(user, {
      clientId: body.clientId,
      destination: body.destination,
      datesMode: body.datesMode,
      startDate: body.datesMode === "exact" ? (body.startDate ?? null) : null,
      endDate: body.datesMode === "exact" ? (body.endDate ?? null) : null,
      adults: body.adults,
      children: body.children,
      travelers: guests,
      title: body.title,
    });

    const response: CreateTripResponse = {
      trip: { id: created.trip.id, title: created.trip.title },
      chatId: created.chatId,
    };
    return Response.json(response, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
