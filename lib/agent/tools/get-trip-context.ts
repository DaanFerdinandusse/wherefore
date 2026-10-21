import { FatalError } from "workflow";

import { loadTripContext, type TripContext } from "../trip-context";

// get_trip_context: the trip, travelers with favorites, taste tags and rules,
// the advisor's places in the city, board counts, asks and the itinerary.
// Read only, so a step retry is harmless.

export async function getTripContextStep(tripId: string): Promise<TripContext> {
  "use step";
  const context = await loadTripContext(tripId);
  if (!context) throw new FatalError("This chat's trip no longer exists.");
  return context;
}
