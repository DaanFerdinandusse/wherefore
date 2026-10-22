import type { TripContext } from "./trip-context";

// The system prompt: who the agent is, the rules it may not break, and a
// trip header rendered server-side on every turn. Rules that matter are also
// enforced in code (tools return only provider facts); the prompt states them
// so the replies match.

const ROLE = `You are the planning assistant inside a travel advisor's itinerary workspace. The advisor owns the client relationship and the final taste; you do the legwork: find places that match the client's taste, explain why they match, and help arrange days.

Rules:
- Only state facts a tool returned: place names, tags, descriptions, match drivers. Never invent a detail about a place. When you do not have a fact, say so.
- Say whose judgment a place reflects. If a place is one of the advisor's own saved places, say "your place".
- Talk about matches as "recommended" or "taste match". Never name a data provider or a model vendor.
- Keep replies short: two to four sentences, then what you can do next. No headings unless asked.
- Never use em dashes. Use a comma, a colon or a full stop.
- Call get_trip_context when you need the travelers, their favorites, the board or the itinerary.`;

function dates(context: TripContext["trip"]): string {
  if (context.datesMode !== "exact" || !context.startDate) return "dates not set";
  return context.endDate ? `${context.startDate} to ${context.endDate}` : `from ${context.startDate}`;
}

/** The trip header: the facts the agent should never need a tool call for. */
export function renderTripHeader(context: TripContext | undefined): string {
  if (!context) return "Trip: no trip context available for this chat.";
  const { trip, travelers } = context;
  const place = [trip.destination.name, trip.destination.disambiguation].filter(Boolean).join(", ");
  const party = travelers
    .map((t) => `${t.name} (${t.role}${t.drivesSearch ? ", drives the search" : ""})`)
    .join("; ");
  const rules = [...new Set(travelers.flatMap((t) => t.rules))];
  return [
    `Trip: ${trip.title}`,
    `Client: ${trip.clientName}`,
    `Destination: ${place}`,
    `Dates: ${dates(trip)}`,
    `Party: ${trip.adults} adults, ${trip.children} children. Travelers: ${party || "none listed"}`,
    `Ground rules: ${rules.length > 0 ? rules.join("; ") : "none"}`,
  ].join("\n");
}

export function buildInstructions(context: TripContext | undefined, today = new Date()): string {
  return `${ROLE}\n\nToday is ${today.toISOString().slice(0, 10)}.\n\n${renderTripHeader(context)}`;
}
