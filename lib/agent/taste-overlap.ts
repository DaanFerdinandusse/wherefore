import type { Explainability, PlaceTag } from "@/lib/contracts";
import { isPlainDriver } from "@/lib/qloo/normalize";

// "Like Via Carota: Italian, warm, stylish". Driver shares are nearly flat
// (27/25/25/23), so a share alone says nothing about one place. What does is
// the tags a place has in common with one favorite: this module finds that
// favorite and those tags, and writes the line. Pure, and free of server
// code: the itinerary cards and the place card render the same line.
//
// Only tags that say what a place is like count. Customer identity, interests
// and activity tags gave noise such as "tourists" and "locals".

/**
 * What one shared tag of a family says, in the order a tie is settled. Sharing
 * a cuisine says far more than sharing a mood: a tag rich favorite such as a
 * cocktail bar shares some mood with every place, and would win them all.
 */
const TASTE_FAMILIES: Record<string, { rank: number; weight: number }> = {
  "urn:tag:cuisine:qloo": { rank: 0, weight: 3 },
  "urn:tag:culinary_style:qloo": { rank: 1, weight: 1.5 },
  "urn:tag:ambience:qloo": { rank: 2, weight: 1 },
  "urn:tag:decor:qloo": { rank: 3, weight: 1 },
};

/** Fewer shared tags than this is not a likeness: there is no line. */
export const MIN_LIKE_TAGS = 2;
export const MAX_LIKE_TAGS = 3;

// True of most places, or a word for the kind of place rather than its taste.
// "Michelin star" would read as a star the provider does not confirm.
const EMPTY_TAGS = new Set([
  "authentic",
  "bar",
  "cafe",
  "casual",
  "clean",
  "comfortable",
  "contemporary",
  "functional",
  "international",
  "michelin star",
  "modern",
  "simple",
  "unique",
  "urban",
]);

const keyOf = (name: string) => name.trim().toLowerCase();

type TasteTag = { key: string; name: string; rank: number; weight: number };

/** A place's tags that can carry a likeness: one per name, across families, empty words out. */
function tasteTags(tags: readonly PlaceTag[]): TasteTag[] {
  const byKey = new Map<string, TasteTag>();
  for (const tag of tags) {
    const family = TASTE_FAMILIES[tag.type ?? ""];
    const key = keyOf(tag.name);
    if (!family || !key || EMPTY_TAGS.has(key)) continue;
    const known = byKey.get(key);
    if (!known || family.rank < known.rank) byKey.set(key, { key, name: tag.name.trim(), ...family });
  }
  return [...byKey.values()];
}

/** How many candidates of one search carry each taste tag. */
export type SearchTags = { candidates: number; carriers: Map<string, number> };

export function searchTags(candidates: readonly (readonly PlaceTag[])[]): SearchTags {
  const carriers = new Map<string, number>();
  for (const tags of candidates) {
    for (const { key } of tasteTags(tags)) carriers.set(key, (carriers.get(key) ?? 0) + 1);
  }
  return { candidates: candidates.length, carriers };
}

/** "Rustic" adds nothing next to "Rustic chic". */
function echoes(a: string, b: string): boolean {
  return ` ${a} `.includes(` ${b} `) || ` ${b} `.includes(` ${a} `);
}

type RankedTag = { name: string; telling: number };

/** Shared tags, most telling first. A tag every candidate carries tells nothing: it is worth 0 and comes last. */
function rankedOverlap(candidate: readonly PlaceTag[], favorite: readonly PlaceTag[], search: SearchTags): RankedTag[] {
  const theirs = new Set(tasteTags(favorite).map((tag) => tag.key));
  const ranked = tasteTags(candidate)
    .filter((tag) => theirs.has(tag.key))
    .map((tag) => {
      const carried = (search.carriers.get(tag.key) ?? 0) / Math.max(1, search.candidates);
      return { key: tag.key, name: tag.name, rank: tag.rank, telling: tag.weight * (1 - carried) };
    })
    .sort((a, b) => b.telling - a.telling || a.rank - b.rank);
  const out: typeof ranked = [];
  for (const tag of ranked) {
    if (!out.some((kept) => echoes(kept.key, tag.key))) out.push(tag);
  }
  return out.slice(0, MAX_LIKE_TAGS);
}

/**
 * The taste tags a candidate and a favorite have in common that a line can
 * show, the ones that tell this place apart first. Names are the candidate's.
 */
export function overlapTags(candidate: readonly PlaceTag[], favorite: readonly PlaceTag[], search: SearchTags): string[] {
  return rankedOverlap(candidate, favorite, search).map((tag) => tag.name);
}

/** One driver row, or what is known of it where the entity id may be missing. */
type Driver = { entityId?: string; name: string; share: number; tags?: string[]; media?: boolean };

/** A client favorite that drives this place and can have place tags: no plain entry, no artist or film. */
function isPlaceFavorite(driver: Driver): boolean {
  return driver.name.trim().length > 0 && !isPlainDriver(driver.entityId ?? "") && !driver.media;
}

/** The driver a card is "Like": the row that carries tags. Never a plain entry. */
export function likeDriver<T extends Driver>(because: readonly T[]): T | undefined {
  return because.find((driver) => isPlaceFavorite(driver) && (driver.tags?.length ?? 0) >= MIN_LIKE_TAGS);
}

/**
 * "Like Via Carota: Italian, warm, stylish", for a line on a card. With
 * `maxLength` the least telling tags go first; null when even two do not fit.
 * Null without a tagged driver.
 */
export function likeLine(because: readonly Driver[], maxLength = Infinity): string | null {
  const driver = likeDriver(because);
  const tags = (driver?.tags ?? []).map(tagPhrase);
  for (let count = tags.length; driver && count >= MIN_LIKE_TAGS; count--) {
    const line = `Like ${driver.name}: ${tags.slice(0, count).join(", ")}`;
    if (line.length <= maxLength) return line;
  }
  return null;
}

/** The artist or film among the three biggest favorites of a place, the biggest first. */
export function mediaDriver<T extends Driver>(because: readonly T[]): T | undefined {
  return because
    .filter((driver) => driver.name.trim().length > 0 && !isPlainDriver(driver.entityId ?? "") && driver.share > 0)
    .sort((a, b) => b.share - a.share)
    .slice(0, 3)
    .find((driver) => driver.media);
}

/** A driver row without tags. */
function untagged({ entityId, name, share, media }: Explainability[number]): Explainability[number] {
  return { entityId, name, share, ...(media ? { media } : {}) };
}

/**
 * The drivers of one candidate with the tags on the favorite of the best
 * overlap, and only there: the most telling tags a line can show, then the
 * most tags, then the bigger share (drivers come biggest first). A favorite is
 * never like itself, and one under MIN_LIKE_TAGS does not qualify. Without any
 * the drivers come back without tags and the card keeps its other lines.
 */
export function withOverlap(
  candidate: { entityId: string; tags: readonly PlaceTag[] },
  because: Explainability,
  favoriteTags: ReadonlyMap<string, readonly PlaceTag[]>,
  search: SearchTags,
): Explainability {
  let best: { entityId: string; tags: RankedTag[]; telling: number } | undefined;
  for (const driver of because) {
    if (!isPlaceFavorite(driver) || driver.share <= 0 || driver.entityId === candidate.entityId) continue;
    const tags = rankedOverlap(candidate.tags, favoriteTags.get(driver.entityId) ?? [], search);
    if (tags.length < MIN_LIKE_TAGS) continue;
    const telling = tags.reduce((sum, tag) => sum + tag.telling, 0);
    if (!best || telling > best.telling || (telling === best.telling && tags.length > best.tags.length)) {
      best = { entityId: driver.entityId, tags, telling };
    }
  }
  const names = best?.tags.map((tag) => tag.name);
  return because.map((driver) => (names && driver.entityId === best?.entityId ? { ...untagged(driver), tags: names } : untagged(driver)));
}

/**
 * The tags of `tagged` on the rows of `target`, by favorite. An ask's rows
 * keep their own shares, which can differ from the trip place's.
 */
export function carryTags(target: Explainability, tagged: Explainability | undefined): Explainability {
  if (!tagged) return target;
  const tags = new Map(tagged.flatMap((driver) => (driver.tags ? [[driver.entityId, driver.tags] as const] : [])));
  return target.map((driver) => {
    const carried = tags.get(driver.entityId);
    return carried ? { ...untagged(driver), tags: carried } : untagged(driver);
  });
}

// Adjectives of places and peoples stay capitalized ("Italian", "Japanese").
const PROPER_ADJECTIVES = new Set(
  (
    "italian french japanese chinese thai indian mexican spanish portuguese greek turkish korean vietnamese " +
    "lebanese moroccan peruvian brazilian argentinian argentine american british english irish scottish welsh european " +
    "german austrian swiss dutch belgian scandinavian nordic danish swedish norwegian finnish icelandic " +
    "mediterranean middle eastern asian african ethiopian caribbean cuban filipino indonesian malaysian " +
    "persian israeli georgian basque catalan sicilian neapolitan tuscan roman venetian parisian provencal " +
    "cajun creole hawaiian australian latin cantonese szechuan sichuan taiwanese nepalese pakistani polish " +
    "russian ukrainian hungarian czech balkan levantine colombian venezuelan chilean egyptian senegalese " +
    "nigerian jamaican singaporean burmese tibetan mongolian uzbek armenian syrian iranian afghan iberian " +
    "tex-mex pan-asian pan-latin"
  ).split(" "),
);

export function isProperAdjective(word: string): boolean {
  return PROPER_ADJECTIVES.has(word.toLowerCase());
}

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

/** One word of a tag: "BBQ" stays, "Tex-Mex" stays, "Japanese-inspired" keeps only its adjective. */
function wordPhrase(word: string): string {
  if (word.length > 1 && /\p{Lu}/u.test(word) && word === word.toUpperCase()) return word;
  const whole = isProperAdjective(word);
  return word
    .split("-")
    .map((part) => (whole || isProperAdjective(part) ? capitalized(part) : part.toLowerCase()))
    .join("-");
}

/** A tag as it reads mid-sentence: "Cozy" -> "cozy", "Italian" stays. */
export function tagPhrase(tag: string): string {
  return tag.split(/\s+/).map(wordPhrase).join(" ");
}
