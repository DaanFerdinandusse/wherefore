import { z } from "zod";

import type { Destination, SlotName } from "@/lib/contracts";
import { distanceM, type LatLon } from "@/lib/map/geo";
import type { WiderCircle } from "@/lib/qloo/contracts";

// Where a search looks. A destination's radius covers a whole metro (up to
// 25 km) and taste does not care about distance, so a search of all of it
// finds places nobody would travel to. This picks a small circle from what
// the trip already holds, in this order: the map region, a named neighborhood
// or place, that day's places, the hotel, the middle of the itinerary, the
// city center. Wider circles around the same point come in only when the
// small one has too few matches. The agent says what to search around; the
// geometry stays here, so no coordinate is ever the model's arithmetic. Pure.

/** A place in the itinerary that has coordinates. */
export type PlacedPoint = LatLon & { day: number; slot: SlotName; name: string };

export const searchAreaSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  radiusM: z.number(),
  widen: z.array(z.object({ radiusM: z.number(), below: z.number().optional() })),
  near: z.string().optional(),
});

export type SearchArea = LatLon & {
  radiusM: number;
  /** Wider circles around the same point, tried before a filter is dropped. */
  widen: WiderCircle[];
  /** What the circle is around: "day 2's places", "Contramar". Absent for the city itself. */
  near?: string;
};

export type SearchAreaInput = {
  destination: Pick<Destination, "lat" | "lon" | "radiusM">;
  placed: readonly PlacedPoint[];
  /** The exact circle from the map's "Search this region". Wins over everything. */
  region?: LatLon & { radiusM: number };
  /** A neighborhood or a place the advisor named, already resolved. */
  spot?: LatLon & { name: string };
  /** The trip day this search is for. */
  day?: number;
  /** A hotel search: it does not stay near the day, and never near another hotel. */
  forStay?: boolean;
  /** How far the advisor wants to go. Replaces the radius and every wider circle. */
  radiusM?: number;
};

/** A neighborhood or one place: walking distance. */
const SPOT_RADIUS_M = 1_500;
const SPOT_WIDER_M = 3_000;
/** A day keeps to one part of town, with room around the places already on it. */
const DAY_MIN_RADIUS_M = 2_500;
const DAY_MAX_RADIUS_M = 5_000;
const DAY_MARGIN_M = 1_000;
const TRIP_RADIUS_M = 5_000;
/** The part of a city people actually move around in. */
const CITY_RADIUS_M = 8_000;
/** The whole destination is searched only when the rest found fewer places than this. */
const FEW_MATCHES = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The middle of some places. A median, so one day trip does not drag it across town. */
export function middleOf(points: readonly LatLon[]): LatLon {
  return { lat: median(points.map((p) => p.lat)), lon: median(points.map((p) => p.lon)) };
}

function cityRadiusOf(destination: SearchAreaInput["destination"]): number {
  return Math.min(CITY_RADIUS_M, destination.radiusM);
}

function widerThan(radiusM: number, destination: SearchAreaInput["destination"]): WiderCircle[] {
  const city = cityRadiusOf(destination);
  const circles = [...new Set([DAY_MAX_RADIUS_M, city])]
    .filter((r) => r > radiusM && r <= city)
    .sort((a, b) => a - b)
    .map((r): WiderCircle => ({ radiusM: r }));
  return destination.radiusM > Math.max(radiusM, city) ? [...circles, { radiusM: destination.radiusM, below: FEW_MATCHES }] : circles;
}

function around(point: LatLon, radiusM: number, destination: SearchAreaInput["destination"], near: string): SearchArea {
  return { lat: point.lat, lon: point.lon, radiusM, widen: widerThan(radiusM, destination), near };
}

function aroundDay(points: readonly PlacedPoint[], day: number, destination: SearchAreaInput["destination"]): SearchArea {
  const middle = middleOf(points);
  const reach = Math.max(...points.map((p) => distanceM(middle, p)));
  const radiusM = Math.min(DAY_MAX_RADIUS_M, Math.max(DAY_MIN_RADIUS_M, Math.round((reach + DAY_MARGIN_M) / 100) * 100));
  return around(middle, radiusM, destination, points.length === 1 ? points[0].name : `day ${day}'s places`);
}

/** The hotel of a day: the one on that day, else the closest day that has one. */
function stayFor(placed: readonly PlacedPoint[], day: number): PlacedPoint | undefined {
  return placed
    .filter((p) => p.slot === "stay")
    .sort((a, b) => Math.abs(a.day - day) - Math.abs(b.day - day) || a.day - b.day)[0];
}

function anchorOf(input: SearchAreaInput): SearchArea {
  const { destination, placed, spot, day, forStay } = input;
  if (spot) return { lat: spot.lat, lon: spot.lon, radiusM: SPOT_RADIUS_M, widen: [{ radiusM: SPOT_WIDER_M }], near: spot.name };

  if (day !== undefined && !forStay) {
    const onDay = placed.filter((p) => p.day === day && p.slot !== "stay");
    if (onDay.length > 0) return aroundDay(onDay, day, destination);
    const stay = stayFor(placed, day);
    if (stay) return around(stay, DAY_MIN_RADIUS_M, destination, stay.name);
  }

  const trip = forStay ? placed.filter((p) => p.slot !== "stay") : placed;
  if (trip.length > 0) {
    const radiusM = Math.min(TRIP_RADIUS_M, cityRadiusOf(destination));
    return around(middleOf(trip), radiusM, destination, new Set(trip.map((p) => p.name)).size === 1 ? trip[0].name : "your itinerary");
  }

  const radiusM = cityRadiusOf(destination);
  return { lat: destination.lat, lon: destination.lon, radiusM, widen: widerThan(radiusM, destination) };
}

/** The circle a search runs in. */
export function chooseSearchArea(input: SearchAreaInput): SearchArea {
  const { destination, radiusM } = input;
  if (input.region) return { ...input.region, widen: [] };
  if (radiusM === undefined) return anchorOf(input);
  // Anywhere in the city is a search of the city, not of a far corner around one place.
  if (radiusM >= destination.radiusM) return { lat: destination.lat, lon: destination.lon, radiusM, widen: [] };
  return { ...anchorOf(input), radiusM, widen: [] };
}

/** "800 m", "2.5 km", "8 km". */
export function distanceLabel(meters: number): string {
  return meters < 1_000 ? `${Math.round(meters)} m` : `${Math.round(meters / 100) / 10} km`;
}

/** "within 2.5 km of day 2's places": where a search looked, for the model. */
export function searchedAreaText(area: Pick<SearchArea, "near">, reachedM: number, destinationName: string): string {
  return `within ${distanceLabel(reachedM)} of ${area.near ?? `the center of ${destinationName}`}`;
}

/** The note for a search that had to leave its first circle. */
export function widenedNote(area: Pick<SearchArea, "radiusM">, reachedM: number): string | undefined {
  return reachedM > area.radiusM ? `Few matches close by, so the search went out to ${distanceLabel(reachedM)}.` : undefined;
}
