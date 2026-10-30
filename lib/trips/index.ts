import "server-only";

// The trips slice: trips, travelers, trip places, asks, itinerary slots and the
// call log. Every signature is declared in contracts.ts; the pure rules (stage,
// merge, mapping) live in stage.ts, merge.ts and map.ts. Import from "@/lib/trips".

export * from "./contracts";
export { computeStage, tripDayCount, todayIso, TRIP_STAGES } from "./stage";
export { SOURCE_PRIORITY, mergeTripPlace } from "./merge";
export { SLOT_ORDER, defaultTripTitle } from "./map";
export { signalSetHash } from "./evidence";
export { TurnLostError, type TurnGuard } from "./turn-guard";
export { toSharedTripView } from "./share";
export {
  clientPastDestinations,
  DEFAULT_TRIPS_PER_STAGE,
  getSharedTripView,
  getTrip,
  getTripSnapshot,
  listRecentClientsForTripBar,
  listTripCalls,
  listTripPlaceCards,
  listTrips,
  tripBarCityImages,
} from "./queries";
export {
  addAskPlaces,
  archiveAsk,
  clearSlot,
  createAsk,
  createTrip,
  logTripCall,
  recordShareOpen,
  revokeShare,
  saveReplacement,
  setShareToken,
  setSlots,
  setStageOverride,
  setTripPlaceStatus,
  updateAsk,
  updateTrip,
  upsertSlot,
  upsertTripPlaces,
} from "./mutations";
