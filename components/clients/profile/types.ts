import type { FavoriteTile } from "@/lib/clients/candidates";
import type { ClientTripCard } from "@/lib/clients/contracts";
import type { MediaFavorite, TasteTag } from "@/lib/contracts";

// What the server hands the client profile (C2).
export type ClientProfileData = {
  id: string;
  name: string;
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
