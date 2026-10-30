// Text for map pins and the preview card, built only from data the card
// carries: name, score, the advisor's own place, and the favorites in the
// explainability. No distances, no invented details. The client is named by
// first name because the data has no pronouns.

import type { Category, TripPlaceCard } from "@/lib/contracts";
import { favoriteDrivers } from "@/lib/qloo/normalize";

export function firstName(clientName: string): string {
  return clientName.trim().split(/\s+/)[0] ?? "";
}

/** "Via Carota", "Via Carota and Lilia", "Via Carota, Lilia and Attaboy". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The favorites that drove the match, strongest first. Never "Your places" or "Other favorites". */
export function topFavorites(card: Pick<TripPlaceCard, "because">, max: number): string[] {
  return favoriteDrivers(card.because)
    .sort((a, b) => b.share - a.share)
    .slice(0, max)
    .map((b) => b.name);
}

export type PinLabel = {
  /** "Senhor Uva · 87" */
  title: string;
  /** "Your place · because Ana loves Via Carota"; empty when there is nothing grounded to say. */
  detail: string;
  /** Both on one line, for screen readers and titles. */
  text: string;
};

const LONG_NAME_CHARS = 28;

/** Names past this length take the compact pill on the map. */
export function isLongPinName(name: string): boolean {
  return name.trim().length > LONG_NAME_CHARS;
}

/** The hover label of a highlighted pin. */
export function pinLabel(card: Pick<TripPlaceCard, "name" | "score" | "yourPlace" | "because">, clientName: string): PinLabel {
  const title = typeof card.score === "number" ? `${card.name} · ${card.score}` : card.name;
  const parts: string[] = [];
  if (card.yourPlace) parts.push("Your place");
  const [top] = topFavorites(card, 1);
  const who = firstName(clientName);
  if (top && who) parts.push(`because ${who} loves ${top}`);
  const detail = parts.join(" · ");
  return { title, detail, text: detail ? `${title} · ${detail}` : title };
}

/** "Because Ana loves Via Carota and Lilia", or empty without favorites. */
export function becauseLine(card: Pick<TripPlaceCard, "because">, clientName: string, max = 2): string {
  const names = topFavorites(card, max);
  const who = firstName(clientName);
  if (names.length === 0 || !who) return "";
  return `Because ${who} loves ${joinNames(names)}`;
}

const CATEGORY_LABEL: Record<Category, string | null> = {
  eat: "Eat",
  drink: "Drink",
  coffee: "Coffee",
  see: "See",
  stay: "Stay",
  other: null,
};

/** The small caps line over the name on the preview card: "Drink · Príncipe Real". */
export function typeLine(card: Pick<TripPlaceCard, "category" | "neighborhood">): string {
  return [CATEGORY_LABEL[card.category], card.neighborhood?.trim() || null].filter(Boolean).join(" · ");
}
