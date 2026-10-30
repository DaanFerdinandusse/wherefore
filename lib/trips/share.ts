import { z } from "zod";

import type {
  Category,
  Explainability,
  SharedFavorite,
  SharedGooglePhoto,
  SharedTripDay,
  SharedTripPlace,
  SharedTripSlot,
  SharedTripView,
  TasteTag,
  TripCover,
} from "@/lib/contracts";

import { favoriteDrivers } from "@/lib/qloo/normalize";

import { asCategory, asSlotName, SLOT_ORDER } from "./map";

// The public traveler view, projected from rows. Pure: the query in
// queries.ts selects only these columns, and this file decides what of them
// reaches the page. Nothing here carries an id, a score, an ask or an advisor
// place note. The raw provider properties (keywords, dishes, hotel class)
// arrive as `unknown` and are parsed here with Zod, so a shape we do not know
// shows nothing instead of something wrong.

export type SharedTripRow = {
  title: string;
  destinationName: string;
  cover?: TripCover | null;
  startDate: string | null;
  endDate: string | null;
  clientName: string;
  advisorName: string | null;
  /** The advisor's sign-in email, for "Message Sofía". */
  advisorEmail?: string | null;
};

export type SharedSlotRow = {
  day: number;
  date: string | null;
  slot: string;
  position: number;
  note: string;
  noteForTraveler: boolean;
  /** "agent" notes are the advisor's working notes: never on the traveler view. */
  noteSource?: string;
  /** Null when the slot holds no place (or a removed one). */
  place: {
    name: string;
    category: string;
    imageUrl: string | null;
    neighborhood: string | null;
    explainability: Explainability;
    sharedTags: TasteTag[];
    reason: string | null;
    /** Every photo url of the place, in the provider's order. */
    images?: readonly string[];
    /** Only for the lookup in traveler-photos.ts: never reaches the page. */
    googlePlaceId?: string | null;
    /** Google's photos when it has them: they replace `images`. */
    googlePhotos?: readonly (SharedGooglePhoto & { src: string })[];
    description?: string | null;
    /** properties.keywords: `{ name, count }[]` from reviews. */
    keywords?: unknown;
    /** properties.specialty_dishes. */
    dishes?: unknown;
    /** properties.hotel_class, else properties.star_rating. */
    hotelClass?: unknown;
  } | null;
};

/** A favorite of a traveler on the trip with its photo, to show next to its name. */
export type SharedFavoriteRow = { entityId: string | null; name: string; imageUrl: string | null };

export const MAX_PLACE_IMAGES = 3;
export const MAX_KEYWORDS = 4;
export const MAX_DISHES = 3;
export const MAX_FAVORITES = 5;

/** "Ana" from "Ana Ruiz". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** YYYY-MM-DD of trip day `day` (1-based) from the start date. */
export function dayDate(startDate: string | null, day: number): string | undefined {
  if (!startDate) return undefined;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start)) return undefined;
  return new Date(start + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

/** Only absolute http(s) urls: stored proxy urls need a session the traveler does not have. */
function isPublicImage(url: string | null | undefined): url is string {
  return typeof url === "string" && /^https?:\/\//i.test(url.trim());
}

const keywordSchema = z.object({ name: z.string(), count: z.number().optional() });
const dishSchema = z.union([z.string(), z.object({ name: z.string() })]);
const classSchema = z.union([z.number(), z.string().regex(/^\s*\d(\.\d+)?\s*$/)]);

const normalized = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").trim().toLowerCase();

/** "cardamom buns" as "Cardamom buns". */
function sentenceCase(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// Words every review uses ("chef", "server", "atmosphere"): true of any
// place, so they say nothing about this one.
const GENERIC_KEYWORDS = new Set(
  (
    "chef chefs server servers staff waiter waiters waitress service food cuisine atmosphere ambiance ambience " +
    "place restaurant bar cafe price prices menu experience vibe vibes owner owners bartender bartenders " +
    "location table tables reservation reservations dish dishes meal meals music decor drinks portion portions " +
    "course courses entree entrée wine wines"
  ).split(" "),
);

/**
 * The review keywords to show, most mentioned first: entries that do not
 * parse, repeat, only name the place itself or are generic review words are
 * skipped.
 */
export function keywordsOf(raw: unknown, placeName: string, max = MAX_KEYWORDS): string[] {
  if (!Array.isArray(raw)) return [];
  const parsed = raw.flatMap((entry) => {
    const result = keywordSchema.safeParse(entry);
    return result.success && result.data.name.trim() ? [result.data] : [];
  });
  parsed.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  const skip = new Set([normalized(placeName), ...GENERIC_KEYWORDS]);
  const out: string[] = [];
  for (const keyword of parsed) {
    const key = normalized(keyword.name);
    if (skip.has(key)) continue;
    skip.add(key);
    out.push(sentenceCase(keyword.name));
    if (out.length >= max) break;
  }
  return out;
}

/** The specialty dishes in the provider's order, in sentence case ("Tostadas De Atun" as "Tostadas de atun"). */
export function dishesOf(raw: unknown, max = MAX_DISHES): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    const result = dishSchema.safeParse(entry);
    if (!result.success) continue;
    const name = (typeof result.data === "string" ? result.data : result.data.name).trim().replace(/\s+/g, " ");
    if (!name || seen.has(normalized(name))) continue;
    seen.add(normalized(name));
    out.push(sentenceCase(name.toLowerCase()));
    if (out.length >= max) break;
  }
  return out;
}

/** A whole hotel class from 1 to 5, else undefined. */
export function hotelClassOf(raw: unknown): number | undefined {
  const result = classSchema.safeParse(raw);
  if (!result.success) return undefined;
  const value = Math.floor(Number(result.data));
  return value >= 1 && value <= 5 ? value : undefined;
}

/**
 * What makes two photo urls the same photo: the provider serves one image
 * under several crops ("...-420x-outside.jpg", "...-420x-auto.jpg"), all
 * named by the image's uuid.
 */
export function imageKey(url: string): string {
  const uuid = /\/i\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(url);
  return uuid?.[1] ? uuid[1].toLowerCase() : url.trim();
}

/** Up to three distinct photos, the provider's order kept. */
export function imagesOf(place: Pick<NonNullable<SharedSlotRow["place"]>, "images" | "imageUrl">): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of [...(place.images ?? []), ...(place.imageUrl ? [place.imageUrl] : [])]) {
    if (!isPublicImage(url)) continue;
    const key = imageKey(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url.trim());
    if (out.length >= MAX_PLACE_IMAGES) break;
  }
  return out;
}

function toSharedPlace(place: NonNullable<SharedSlotRow["place"]>): SharedTripPlace {
  const category: Category = asCategory(place.category);
  const google = place.googlePhotos?.slice(0, MAX_PLACE_IMAGES) ?? [];
  const images = google.length > 0 ? google.map((photo) => photo.src) : imagesOf(place);
  const description = place.description?.trim();
  const keywords = keywordsOf(place.keywords, place.name);
  const dishes = dishesOf(place.dishes);
  const hotelClass = category === "stay" ? hotelClassOf(place.hotelClass) : undefined;
  return {
    name: place.name,
    category,
    ...(images[0] ? { imageUrl: images[0] } : {}),
    neighborhood: place.neighborhood ?? undefined,
    // Named favorites only: "Your places" and "Other favorites" are no favorites of the traveler's.
    because: favoriteDrivers(place.explainability).map(({ name, share, media }) => ({ name, share, ...(media ? { media } : {}) })),
    sharedTags: place.sharedTags.map((tag) => tag.name),
    reason: place.reason?.trim() || undefined,
    ...(images.length > 0 ? { images } : {}),
    ...(google.length > 0 ? { googlePhotos: Object.fromEntries(google.map(({ src, ...photo }) => [src, photo])) } : {}),
    ...(description ? { description } : {}),
    ...(keywords.length > 0 ? { keywords } : {}),
    ...(dishes.length > 0 ? { dishes } : {}),
    ...(hotelClass ? { hotelClass } : {}),
  };
}

function toSharedSlot(row: SharedSlotRow): SharedTripSlot | null {
  const note = row.note.trim();
  const advisorNote = row.noteForTraveler && row.noteSource !== "agent" && note ? note : undefined;
  if (!row.place && !advisorNote) return null;
  return {
    slot: asSlotName(row.slot),
    position: row.position,
    ...(row.place ? { place: toSharedPlace(row.place) } : {}),
    ...(advisorNote ? { advisorNote } : {}),
  };
}

/**
 * The favorites that drove the shown places, most influential first (shares
 * summed over every place), each with a photo when one of the travelers'
 * favorites matches it by id, else by name. Never a favorite that drove no
 * place on the itinerary.
 */
export function favoritesOf(
  slots: readonly SharedSlotRow[],
  known: readonly SharedFavoriteRow[],
  max = MAX_FAVORITES,
): SharedFavorite[] {
  const totals = new Map<string, { name: string; entityIds: Set<string>; share: number }>();
  for (const row of slots) {
    if (!row.place) continue;
    for (const driver of favoriteDrivers(row.place.explainability)) {
      const name = driver.name.trim();
      const key = normalized(name);
      const entry = totals.get(key) ?? { name, entityIds: new Set<string>(), share: 0 };
      entry.share += driver.share;
      entry.entityIds.add(driver.entityId);
      totals.set(key, entry);
    }
  }
  const byId = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const favorite of known) {
    if (!isPublicImage(favorite.imageUrl)) continue;
    if (favorite.entityId && !byId.has(favorite.entityId)) byId.set(favorite.entityId, favorite.imageUrl);
    const key = normalized(favorite.name);
    if (!byName.has(key)) byName.set(key, favorite.imageUrl);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1].share - a[1].share)
    .slice(0, max)
    .map(([key, entry]) => {
      const imageUrl = [...entry.entityIds].map((id) => byId.get(id)).find(Boolean) ?? byName.get(key);
      return imageUrl ? { name: entry.name, imageUrl } : { name: entry.name };
    });
}

/** Days in order, each with its slots in the order of the day. Empty days are left out. */
export function toSharedTripView(
  trip: SharedTripRow,
  slots: SharedSlotRow[],
  knownFavorites: readonly SharedFavoriteRow[] = [],
): SharedTripView {
  const byDay = new Map<number, { date?: string; slots: SharedTripSlot[] }>();
  const ordered = [...slots].sort(
    (a, b) =>
      a.day - b.day ||
      SLOT_ORDER.indexOf(asSlotName(a.slot)) - SLOT_ORDER.indexOf(asSlotName(b.slot)) ||
      a.position - b.position,
  );
  for (const row of ordered) {
    const slot = toSharedSlot(row);
    if (!slot) continue;
    const day = byDay.get(row.day) ?? { date: row.date ?? dayDate(trip.startDate, row.day), slots: [] };
    day.slots.push(slot);
    byDay.set(row.day, day);
  }
  const days: SharedTripDay[] = [...byDay.entries()].map(([day, value]) => ({
    day,
    ...(value.date ? { date: value.date } : {}),
    slots: value.slots,
  }));
  const favorites = favoritesOf(ordered, knownFavorites);
  const advisorEmail = trip.advisorEmail?.trim();
  return {
    title: trip.title,
    destinationName: trip.destinationName,
    ...(trip.startDate ? { startDate: trip.startDate } : {}),
    ...(trip.endDate ? { endDate: trip.endDate } : {}),
    preparedFor: firstName(trip.clientName),
    advisorName: trip.advisorName,
    ...(advisorEmail && z.email().safeParse(advisorEmail).success ? { advisorEmail } : {}),
    ...(trip.cover ? { cover: trip.cover } : {}),
    ...(favorites.length > 0 ? { favorites } : {}),
    days,
  };
}
