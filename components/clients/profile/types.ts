import type { FavoriteTile } from "@/lib/clients/candidates";
import type { ClientTripCard } from "@/lib/clients/contracts";
import type { MediaFavorite, TasteTag } from "@/lib/contracts";

// What the server hands the client profile (C and C2). A new client is the
// same shape with no id and empty fields.
export type ClientProfileData = {
  id: string | null;
  name: string;
  homeCity: string;
  homeLat: number | null;
  homeLon: number | null;
  notes: string;
  groundRules: string[];
  mediaFavorites: MediaFavorite[];
  tasteTags: TasteTag[];
  /** ISO timestamp, for "Client since March 2024". */
  createdAt: string | null;
  favorites: FavoriteTile[];
  trips: { upcoming: ClientTripCard[]; past: ClientTripCard[] };
};

export const NEW_CLIENT: ClientProfileData = {
  id: null,
  name: "",
  homeCity: "",
  homeLat: null,
  homeLon: null,
  notes: "",
  groundRules: [],
  mediaFavorites: [],
  tasteTags: [],
  createdAt: null,
  favorites: [],
  trips: { upcoming: [], past: [] },
};
