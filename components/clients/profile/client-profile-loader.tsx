import { notFound } from "next/navigation";

import { requirePageUser } from "@/lib/auth/server";
import { getClientProfile, listClientTripCards } from "@/lib/clients";

import { toFavoriteTile } from "../favorites";
import { todayIso } from "../format";
import { ClientProfile } from "./client-profile";
import type { ClientProfileData } from "./types";

// Loads one client for C2 on the server and hands the profile plain data.
// Out of scope or unknown ids are a 404.
export async function ClientProfileLoader({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const profile = await getClientProfile(id, user);
  if (!profile) notFound();

  const { client, favorites, trips } = profile;
  const ids = [...trips.upcoming, ...trips.past].map((trip) => trip.id);
  const cards = new Map((await listClientTripCards(ids, user)).map((card) => [card.id, card]));
  const toCards = (rows: { id: string }[]) => rows.flatMap((row) => cards.get(row.id) ?? []);

  const data: ClientProfileData = {
    id: client.id,
    name: client.name,
    homeLat: client.homeLat,
    homeLon: client.homeLon,
    notes: client.notes,
    groundRules: client.groundRules,
    mediaFavorites: client.mediaFavorites,
    tasteTags: client.tasteTags,
    createdAt: client.createdAt.toISOString(),
    favorites: favorites.map(toFavoriteTile),
    trips: { upcoming: toCards(trips.upcoming), past: toCards(trips.past) },
  };

  // Keyed by id so a soft navigation to another client starts from its own data.
  return <ClientProfile key={client.id} initial={data} today={todayIso()} />;
}
