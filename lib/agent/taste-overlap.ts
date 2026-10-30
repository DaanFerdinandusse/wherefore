import type { Category, Explainability, PlaceKeyword, PlaceTag } from "@/lib/contracts";
import { isPlainDriver } from "@/lib/qloo/normalize";

// "Like Via Carota: Italian, warm, stylish". Driver shares are nearly flat
// (27/25/25/23), so a share alone says nothing about one place. What does is
// the tags a place has in common with one favorite: this module finds that
// favorite and those tags, and writes the line. Pure, and free of server
// code: the itinerary cards and the place card render the same line.
//
// Only tags that say what a place is like count. Customer identity, interests
// and activity tags gave noise such as "tourists" and "locals".
//
// "Like" only compares places of one kind: a steakhouse is not like a cocktail
// bar, however much mood they share. Across kinds the line claims the shared
// feel and no more: "Same intimate, romantic feel as Attaboy". The favorite is
// chosen on what sets it apart from the client's other favorites, not on what
// is rare in one search, so a place keeps its favorite from search to search.

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

/** The families a shared feel across kinds of place can rest on: mood, not cuisine. */
const FEEL_RANK = 2;

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

/** The taste tags two places have in common, the candidate's names. */
function sharedTags(candidate: readonly PlaceTag[], favorite: readonly PlaceTag[]): TasteTag[] {
  const theirs = new Set(tasteTags(favorite).map((tag) => tag.key));
  return tasteTags(candidate).filter((tag) => theirs.has(tag.key));
}

/** The tags a line shows, most telling first. A tag every candidate carries tells nothing: it comes last. */
function lineTags(shared: readonly TasteTag[], search: SearchTags): string[] {
  const ranked = shared
    .map((tag) => {
      const carried = (search.carriers.get(tag.key) ?? 0) / Math.max(1, search.candidates);
      return { ...tag, telling: tag.weight * (1 - carried) };
    })
    .sort((a, b) => b.telling - a.telling || a.rank - b.rank);
  const out: typeof ranked = [];
  for (const tag of ranked) {
    if (!out.some((kept) => echoes(kept.key, tag.key))) out.push(tag);
  }
  return out.slice(0, MAX_LIKE_TAGS).map((tag) => tag.name);
}

/**
 * The taste tags a candidate and a favorite have in common that a line can
 * show, the ones that tell this place apart first. Names are the candidate's.
 */
export function overlapTags(candidate: readonly PlaceTag[], favorite: readonly PlaceTag[], search: SearchTags): string[] {
  return lineTags(sharedTags(candidate, favorite), search);
}

/** One driver row, or what is known of it where the entity id may be missing. */
type Driver = { entityId?: string; name: string; share: number; tags?: string[]; feel?: boolean; media?: boolean };

/** A client favorite that drives this place and can have place tags: no plain entry, no artist or film. */
function isPlaceFavorite(driver: Driver): boolean {
  return driver.name.trim().length > 0 && !isPlainDriver(driver.entityId ?? "") && !driver.media;
}

/** The driver a card is "Like": the row that carries tags. Never a plain entry. */
export function likeDriver<T extends Driver>(because: readonly T[]): T | undefined {
  return because.find((driver) => isPlaceFavorite(driver) && (driver.tags?.length ?? 0) >= MIN_LIKE_TAGS);
}

/** "Like Via Carota: Italian, warm" or "Same intimate, romantic feel as Attaboy", with the tags joined as the caller writes them. */
export function likePhrase(driver: Pick<Driver, "name" | "feel">, tags: string): string {
  return driver.feel ? `Same ${tags} feel as ${driver.name}` : `Like ${driver.name}: ${tags}`;
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
    const line = likePhrase(driver, tags.slice(0, count).join(", "));
    if (line.length <= maxLength) return line;
  }
  return null;
}

/** The artist or film among the three biggest favorites of a place, the biggest first. */
export function mediaDriver<T extends Driver>(because: readonly T[]): T | undefined {
  return namedByShare(because)
    .slice(0, 3)
    .find((driver) => driver.media);
}

function namedByShare<T extends Driver>(because: readonly T[]): T[] {
  return because
    .filter((driver) => driver.name.trim().length > 0 && !isPlainDriver(driver.entityId ?? "") && driver.share > 0)
    .sort((a, b) => b.share - a.share);
}

// Review words that tie an artist to a place. An artist among the drivers says
// little alone: it shows up on half of any list.
const MUSIC_WORDS = /\b(live music|music|jazz|funk|soul|vinyl|records?|djs?|bands?|concerts?)\b/i;
const MIN_MUSIC_MENTIONS = 3;

/** The artist or film worth naming on a place, and the fact that ties them when there is one. */
export type MediaNote = { name: string; fact?: string };

/**
 * Which places name an artist or film, by id. The ones whose reviews talk about
 * music name the artist and that fact. Otherwise only the one place of the
 * search that a film or artist leads the most: a clause on every card says
 * nothing. Never on a hotel.
 */
export function mediaNotes(
  places: readonly { id: string; category: string; because: readonly Driver[]; keywords?: readonly PlaceKeyword[] }[],
  artists: ReadonlySet<string>,
): Map<string, MediaNote> {
  const notes = new Map<string, MediaNote>();
  let leader: { id: string; name: string; lead: number } | undefined;
  for (const place of places) {
    if (place.category === "stay") continue;
    const media = mediaDriver(place.because);
    if (!media) continue;
    const music = artists.has(media.entityId ?? "")
      ? [...(place.keywords ?? [])].sort((a, b) => b.count - a.count).find((k) => k.count >= MIN_MUSIC_MENTIONS && MUSIC_WORDS.test(k.name))
      : undefined;
    if (music) {
      notes.set(place.id, { name: media.name, fact: `reviews mention ${music.name.toLowerCase()}` });
      continue;
    }
    const [first, second] = namedByShare(place.because);
    const lead = first?.media ? first.share - (second?.share ?? 0) : 0;
    if (lead > 0 && (!leader || lead > leader.lead)) leader = { id: place.id, name: media.name, lead };
  }
  if (leader && notes.size === 0) notes.set(leader.id, { name: leader.name });
  return notes;
}

/** A driver row without tags. */
function untagged({ entityId, name, share, media }: Explainability[number]): Explainability[number] {
  return { entityId, name, share, ...(media ? { media } : {}) };
}

/** A client's favorite place, as far as a likeness needs it. */
export type FavoritePlace = { tags: readonly PlaceTag[]; category: Category };

type Overlap = { entityId: string; shared: TasteTag[]; sameKind: boolean; apart: number };

/** Same kind beats another kind; then what sets this favorite apart; then the most tags. Ties keep the bigger share. */
function beats(next: Overlap, best: Overlap): boolean {
  if (next.sameKind !== best.sameKind) return next.sameKind;
  if (next.apart !== best.apart) return next.apart > best.apart;
  return next.shared.length > best.shared.length;
}

/**
 * The drivers of one candidate with the tags on the favorite it is most like,
 * and only there. A tag counts for less the more of the client's favorites
 * carry it, and only the best few count, as many as a line shows: a tag rich
 * favorite does not win every place. A favorite is
 * never like itself, and one under MIN_LIKE_TAGS does not qualify. Without any
 * the drivers come back without tags and the card keeps its other lines.
 */
export function withOverlap(
  candidate: { entityId: string; tags: readonly PlaceTag[]; category: Category },
  because: Explainability,
  favorites: ReadonlyMap<string, FavoritePlace>,
  search: SearchTags,
): Explainability {
  const carriers = searchTags([...favorites.values()].map((favorite) => favorite.tags)).carriers;
  let best: Overlap | undefined;
  for (const driver of because) {
    const favorite = favorites.get(driver.entityId);
    if (!favorite || !isPlaceFavorite(driver) || driver.share <= 0 || driver.entityId === candidate.entityId) continue;
    const sameKind = favorite.category === candidate.category;
    const shared = sharedTags(candidate.tags, favorite.tags).filter((tag) => sameKind || tag.rank >= FEEL_RANK);
    if (lineTags(shared, search).length < MIN_LIKE_TAGS) continue;
    const apart = shared
      .map((tag) => tag.weight / Math.max(1, carriers.get(tag.key) ?? 1))
      .sort((a, b) => b - a)
      .slice(0, MAX_LIKE_TAGS)
      .reduce((sum, value) => sum + value, 0);
    const next = { entityId: driver.entityId, shared, sameKind, apart };
    if (!best || beats(next, best)) best = next;
  }
  const picked = best;
  if (!picked) return because.map(untagged);
  const tags = lineTags(picked.shared, search);
  return because.map((driver) =>
    driver.entityId === picked.entityId ? { ...untagged(driver), tags, ...(picked.sameKind ? {} : { feel: true }) } : untagged(driver),
  );
}

/**
 * The tags of `tagged` on the rows of `target`, by favorite. An ask's rows
 * keep their own shares, which can differ from the trip place's.
 */
export function carryTags(target: Explainability, tagged: Explainability | undefined): Explainability {
  if (!tagged) return target;
  const rows = new Map(tagged.flatMap((driver) => (driver.tags ? [[driver.entityId, driver] as const] : [])));
  return target.map((driver) => {
    const carried = rows.get(driver.entityId);
    return carried ? { ...untagged(driver), tags: carried.tags, ...(carried.feel ? { feel: true } : {}) } : untagged(driver);
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
