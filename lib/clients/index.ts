import "server-only";

// The clients slice: reads in queries.ts, writes in mutations.ts, every
// signature declared in contracts.ts. Import from "@/lib/clients".

export * from "./contracts";
export {
  getClient,
  getClientProfile,
  listClients,
  listFavorites,
  listRecentClients,
} from "./queries";
export {
  addFavorite,
  archiveClient,
  createClient,
  removeFavorite,
  reorderFavorites,
  setGroundRules,
  setMediaFavorites,
  setTasteTags,
  updateClientFields,
  updateFavorite,
} from "./mutations";
