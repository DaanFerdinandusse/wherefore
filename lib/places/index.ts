import "server-only";

// The places slice: the shared place cache and My places. Every signature is
// declared in contracts.ts. Import from "@/lib/places".

export * from "./contracts";
export {
  advisorCities,
  getAdvisorPlaceForPlace,
  getPlace,
  getPlacesByEntityIds,
  listAdvisorPlaces,
  listCityTrips,
} from "./queries";
// scorePlacesForClient lives in ./scores (import "@/lib/places/scores"): it
// reads lib/clients and the agent's signal rules, which the many importers
// of this barrel (the agent among them) should not pull in.
export {
  removeAdvisorPlace,
  saveAdvisorPlace,
  updateAdvisorPlaceNote,
  upsertPlaces,
} from "./mutations";
