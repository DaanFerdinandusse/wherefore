import "server-only";

// The trips slice: trips, travelers, trip places, asks, itinerary slots and the
// call log. Every signature is declared in contracts.ts; the pure rules (stage,
// merge, mapping) live in stage.ts, merge.ts and map.ts. Import from "@/lib/trips".

export * from "./contracts";
export { computeStage, tripDayCount, todayIso, TRIP_STAGES } from "./stage";
export { SOURCE_PRIORITY, mergeTripPlace } from "./merge";
export { SLOT_ORDER, defaultTripTitle } from "./map";
export {
  clientPastDestinations,
  getSharedTripSnapshot,
  getTrip,
  getTripSnapshot,
  listRecentClientsForTripBar,
  listTripCalls,
  listTripPlaceCards,
  listTrips,
} from "./queries";
export {
  addAskPlaces,
  archiveAsk,
  clearSlot,
  createAsk,
  createTrip,
  logTripCall,
  revokeShare,
  setShareToken,
  setSlots,
  setStageOverride,
  setTripPlaceStatus,
  updateAsk,
  updateTrip,
  upsertSlot,
  upsertTripPlaces,
} from "./mutations";
