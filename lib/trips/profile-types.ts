// The place profile's data, as GET /api/trip-places/<tripPlaceId> answers it,
// and the pure shaping from a `places` row to what the sheet renders. No I/O
// and no server-only import: the sheet (a client component) imports the
// types, and the route and the dev page import the builder.
//
// Everything here comes from our own rows (the provider's cached place, the
// advisor's saved place, the trip's asks). Google details are fetched by the
// sheet itself and never pass through this shape.

import type { PlaceImage, PlaceTag, TripPlaceCard } from "@/lib/contracts";

/** One weekday of the provider's opening hours, already formatted ("1 to 11 pm"). */
export type ProviderHoursRow = { weekday: number; text: string };

export type TripPlaceProfilePlace = {
  id: string;
  entityId: string;
  name: string;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  lat: number | null;
  lon: number | null;
  /** "Seafood restaurant": the provider's primary genre or first category tag. */
  kind: string | null;
  /** 1 to 4, from the provider. */
  priceLevel: number | null;
  /** The provider's business rating (no count comes with it). */
  rating: number | null;
  images: PlaceImage[];
  tags: PlaceTag[];
  googlePlaceId: string | null;
  /** The provider's short description. */
  shortDescription: string | null;
  /** Ambience, cuisine and unique selling points, split into short paragraphs. */
  aboutParagraphs: string[];
  /** Feature chips from the provider tags ("Accepts reservations"). */
  features: string[];
  /** Provider hours, Monday (1) to Sunday (7). Empty when the provider has none. */
  hours: ProviderHoursRow[];
  phone: string | null;
  website: string | null;
};

export type TripPlaceProfileAdvisorPlace = {
  id: string;
  note: string;
  /** ISO timestamp. */
  savedAt: string;
  /** Trips that use this saved place as "Your place". */
  inTrips: number;
};

/** A client favorite that drove the match, with its photo when we have the place. */
export type TripPlaceProfileDriver = {
  entityId: string;
  name: string;
  imageUrl: string | null;
  city: string | null;
};

/** The response of GET /api/trip-places/<tripPlaceId>. */
export type TripPlaceProfile = {
  card: TripPlaceCard;
  place: TripPlaceProfilePlace;
  /** The advisor's saved row for this place, linked to the trip place or not. */
  advisorPlace: TripPlaceProfileAdvisorPlace | null;
  /** The live asks (board tabs) this place belongs to. */
  asks: { id: string; label: string }[];
  /** Named drivers of `card.because`, in its order. "Other favorites" is not one. */
  drivers: TripPlaceProfileDriver[];
};

/** What the builder reads from a `places` row. */
export type PlaceRowForProfile = {
  id: string;
  entityId: string;
  name: string;
  address: string | null;
  city: string | null;
  neighborhood: string | null;
  lat: number | null;
  lon: number | null;
  priceLevel: number | null;
  rating: number | null;
  description: string | null;
  images: PlaceImage[];
  tags: PlaceTag[];
  properties: Record<string, unknown>;
  googlePlaceId: string | null;
};

const CATEGORY_TAG_TYPE = "urn:tag:category:place";

// Tag families that read as practical features of a visit, most useful first.
const FEATURE_TAG_TYPES = [
  "urn:tag:planning:place",
  "urn:tag:accessibility:place",
  "urn:tag:amenity:qloo",
  "urn:tag:service_options:place",
  "urn:tag:amenities:place",
  "urn:tag:children:place",
  "urn:tag:pets:place",
] as const;
export const MAX_FEATURES = 6;

const LONG_DESCRIPTION_KEYS = ["ambience_description", "cuisine_description", "unique_selling_points"] as const;
const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Splits text into sentences, then groups them two by two into short paragraphs. */
export function shortParagraphs(value: string, perParagraph = 2): string[] {
  const sentences = value
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/)
    .filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += perParagraph) out.push(sentences.slice(i, i + perParagraph).join(" "));
  return out;
}

/** The long provider descriptions as short paragraphs, without repeating the short one. */
export function aboutParagraphsOf(properties: Record<string, unknown>, shortDescription: string | null): string[] {
  const seen = new Set<string>(shortDescription ? [shortDescription.toLowerCase()] : []);
  const out: string[] = [];
  for (const key of LONG_DESCRIPTION_KEYS) {
    const value = text(properties[key]);
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    out.push(...shortParagraphs(value));
  }
  return out;
}

export function featuresOf(tags: readonly PlaceTag[], max = MAX_FEATURES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const type of FEATURE_TAG_TYPES) {
    for (const tag of tags) {
      if (tag.type !== type) continue;
      const key = tag.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(tag.name);
      if (out.length >= max) return out;
    }
  }
  return out;
}

export function kindOf(properties: Record<string, unknown>, tags: readonly PlaceTag[]): string | null {
  const genre = properties.primary_genre;
  if (genre && typeof genre === "object" && "name" in genre) {
    const name = text((genre as { name: unknown }).name);
    if (name) return name;
  }
  return tags.find((t) => t.type === CATEGORY_TAG_TYPE)?.name ?? null;
}

/** "T13:00:00" as "1 pm", "T12:30:00" as "12:30 pm". */
export function formatClock(value: string): string | null {
  const match = /^T?(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const suffix = hours < 12 || hours === 24 ? "am" : "pm";
  return minutes === 0 ? `${h12} ${suffix}` : `${h12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

type RawRange = { opens?: unknown; closes?: unknown; closed?: unknown };

/** The provider's `hours` block as one formatted row per weekday, Monday first. */
export function providerHoursOf(properties: Record<string, unknown>): ProviderHoursRow[] {
  const hours = properties.hours;
  if (!hours || typeof hours !== "object") return [];
  const rows: ProviderHoursRow[] = [];
  WEEKDAYS.forEach((day, index) => {
    const ranges = (hours as Record<string, unknown>)[day];
    if (!Array.isArray(ranges) || ranges.length === 0) return;
    const parts: string[] = [];
    let closed = false;
    for (const range of ranges as RawRange[]) {
      if (range.closed === true) {
        closed = true;
        continue;
      }
      const opens = typeof range.opens === "string" ? formatClock(range.opens) : null;
      const closes = typeof range.closes === "string" ? formatClock(range.closes) : null;
      if (opens && closes) parts.push(`${opens} to ${closes}`);
    }
    if (parts.length > 0) rows.push({ weekday: index + 1, text: parts.join(", ") });
    else if (closed) rows.push({ weekday: index + 1, text: "Closed" });
  });
  return rows;
}

export function buildProfilePlace(row: PlaceRowForProfile): TripPlaceProfilePlace {
  const properties = row.properties ?? {};
  const shortDescription = text(properties.short_description) ?? text(row.description);
  return {
    id: row.id,
    entityId: row.entityId,
    name: row.name,
    address: row.address,
    city: row.city,
    neighborhood: row.neighborhood,
    lat: row.lat,
    lon: row.lon,
    kind: kindOf(properties, row.tags),
    priceLevel: row.priceLevel,
    rating: row.rating,
    images: row.images.filter((image) => Boolean(image.url)),
    tags: row.tags,
    googlePlaceId: row.googlePlaceId,
    shortDescription,
    aboutParagraphs: aboutParagraphsOf(properties, shortDescription),
    features: featuresOf(row.tags),
    hours: providerHoursOf(properties),
    phone: text(properties.phone),
    website: text(properties.website),
  };
}
