import "server-only";

import type { ScopeInput } from "@/lib/auth/scope";
import type { TripStage } from "@/lib/contracts";

import { listTrips } from "./queries";

// The nav drawer's data: how many trips are in progress and the four most
// recently touched trips that are not done, newest first. `chats` lists a
// trip's conversations, newest first, for the rows nested under the open trip.

export type NavChat = { id: string; title: string; updatedAt: string };

export type NavTrip = {
  id: string;
  clientName: string;
  destinationName: string;
  startDate: string | null;
  endDate: string | null;
  stage: TripStage;
  imageUrl: string | null;
  filledSlots: number;
  days: number;
  chats: NavChat[];
};

export type NavSummary = { tripsInProgress: number; recentTrips: NavTrip[] };

const RECENT = 4;

export async function navSummary(scope: ScopeInput): Promise<NavSummary> {
  const byStage = await listTrips(scope, { perStage: RECENT });
  const open = [...byStage.planning.trips, ...byStage.shared.trips, ...byStage.traveling.trips];
  const recent = open.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, RECENT);
  return {
    tripsInProgress: byStage.planning.total + byStage.shared.total + byStage.traveling.total,
    recentTrips: recent.map((trip) => ({
      id: trip.id,
      clientName: trip.clientName,
      destinationName: trip.destination.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      stage: trip.stage,
      imageUrl: trip.imageUrl,
      filledSlots: trip.counts.filledSlots,
      days: trip.counts.days,
      chats: [],
    })),
  };
}
