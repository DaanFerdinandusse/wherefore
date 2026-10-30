import type {
  SharedFavorite,
  SharedTripDay,
  SharedTripPlace,
  SharedTripSlot,
  SharedTripView,
  SlotName,
  TripCover,
} from "@/lib/contracts";
import { providerImageAt } from "@/lib/images/source";
import { ADVISOR_DRIVER_NAME, OTHER_FAVORITES_NAME, TRIP_PICKS_DRIVER_NAME } from "@/lib/qloo/normalize";

// Pure helpers for the traveler view. Every sentence the page says about a
// place is a template over the shared view's facts (favorite names and
// shares, shared taste tags, counts, dates); these only pick and format them.
// A fact that is missing leaves its sentence out. Dates are ISO days
// ("2026-11-12") read in UTC so a label never shifts with the viewer's time
// zone.

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const DAY_MS = 86_400_000;

function parseDay(iso: string | undefined): Date | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A favorite the traveler can be told about: a real name. The shared view
 * carries no entity ids, and the server already drops the "Your places",
 * "This trip's picks" and "Other favorites" entries; their names are filtered
 * too for views written before that.
 */
function isNamedFavorite(item: { name: string }): boolean {
  const name = item.name.trim();
  return name !== "" && name !== OTHER_FAVORITES_NAME && name !== ADVISOR_DRIVER_NAME && name !== TRIP_PICKS_DRIVER_NAME;
}

/** The place's named favorites, biggest share first. */
function topFavorites(because: SharedTripPlace["because"]): string[] {
  return [...because]
    .filter(isNamedFavorite)
    .sort((a, b) => b.share - a.share)
    .map((item) => item.name.trim());
}

/** "Via Carota", "Via Carota and Lilia", "Via Carota, Lilia and Attaboy". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

const NUMBER_WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
] as const;

/** "Two days", "one place" (lowercase when not leading), digits past twelve. */
export function countOf(count: number, singular: string, plural: string, leading = true): string {
  const word = NUMBER_WORDS[count] ?? String(count);
  return `${leading ? word : word.toLowerCase()} ${count === 1 ? singular : plural}`;
}

// ------------------------------------------------------------------ reasons

// Adjectives of places and peoples keep their capital mid-sentence ("Italian").
const PROPER_ADJECTIVES = new Set(
  (
    "italian french japanese chinese thai indian mexican spanish portuguese greek turkish korean vietnamese " +
    "lebanese moroccan peruvian brazilian argentinian american british english irish european german " +
    "austrian swiss dutch belgian scandinavian nordic danish swedish norwegian mediterranean asian african " +
    "caribbean cuban filipino persian israeli georgian basque catalan sicilian neapolitan tuscan roman " +
    "venetian parisian southern cantonese sichuan taiwanese polish russian hungarian levantine oaxacan"
  ).split(" "),
);

/** A taste tag as it reads mid-sentence: "Cozy" as "cozy", "Natural Wine" as "natural wine", "Italian" stays. */
export function tagPhrase(tag: string): string {
  return tag
    .trim()
    .split(/\s+/)
    .map((word) =>
      PROPER_ADJECTIVES.has(word.toLowerCase())
        ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        : word.toLowerCase(),
    )
    .join(" ");
}

export type ReasonLine = { favorite: string; text: string };

/**
 * "Because you love Via Carota: the same cozy, lively feel." The favorite
 * with the biggest share names the line; up to two shared taste tags finish
 * it. Without tags the line stops at the favorite, and so it does for an
 * artist or film: a place does not have the same feel as a band. Null without
 * a named favorite: a reason must say which favorite the place connects to.
 */
export function reasonLine(place: Pick<SharedTripPlace, "because" | "sharedTags">): ReasonLine | null {
  const favorite = topFavorites(place.because)[0];
  if (!favorite) return null;
  const media = place.because.some((item) => item.media && item.name.trim() === favorite);
  const tags = (media ? [] : place.sharedTags)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map(tagPhrase);
  const text =
    tags.length > 0 ? `Because you love ${favorite}: the same ${tags.join(", ")} feel.` : `Because you love ${favorite}.`;
  return { favorite, text };
}

/**
 * The reason of every place on the page, in page order. When a place has
 * several strong drivers (a share at least half the top one), the one named
 * least so far on the page wins, so eight places in a row do not all say
 * "Because you love Clamato". Every name is still one of that place's own
 * drivers.
 */
export function pageReasons(places: readonly SharedTripPlace[]): Map<SharedTripPlace, ReasonLine | null> {
  const used = new Map<string, number>();
  const out = new Map<SharedTripPlace, ReasonLine | null>();
  for (const place of places) {
    const drivers = [...place.because].filter(isNamedFavorite).sort((a, b) => b.share - a.share);
    const top = drivers[0];
    if (!top) {
      out.set(place, null);
      continue;
    }
    const strong = drivers.filter((driver) => driver.share * 2 >= top.share);
    const pick = strong.reduce((best, driver) =>
      (used.get(driver.name.trim()) ?? 0) < (used.get(best.name.trim()) ?? 0) ? driver : best,
    );
    const line = reasonLine({ because: [pick], sharedTags: place.sharedTags });
    if (line) used.set(line.favorite, (used.get(line.favorite) ?? 0) + 1);
    out.set(place, line);
  }
  return out;
}

/** "Because you love Via Carota and Lilia": the top two favorites by share. Null without any. */
export function becauseLine(because: SharedTripPlace["because"]): string | null {
  const names = topFavorites(because).slice(0, 2);
  if (names.length === 0) return null;
  return `Because you love ${names.join(" and ")}`;
}

// -------------------------------------------------------------------- dates

/** "12 to 16 November", "28 November to 2 December", years only when the range crosses one. */
export function dateRangeLabel(startDate?: string, endDate?: string): string | null {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start) return null;
  const startDay = start.getUTCDate();
  const startMonth = MONTHS[start.getUTCMonth()];
  if (!end || end.getTime() <= start.getTime()) return `${startDay} ${startMonth}`;
  const endText = `${end.getUTCDate()} ${MONTHS[end.getUTCMonth()]}`;
  if (start.getUTCFullYear() !== end.getUTCFullYear()) {
    return `${startDay} ${startMonth} ${start.getUTCFullYear()} to ${endText} ${end.getUTCFullYear()}`;
  }
  if (start.getUTCMonth() !== end.getUTCMonth()) return `${startDay} ${startMonth} to ${endText}`;
  return `${startDay} to ${endText}`;
}

/** The day's big heading and the line next to it: "Friday", "14 May · Príncipe Real to Santos". */
export function dayTitle(day: Pick<SharedTripDay, "day" | "date" | "slots">): { title: string; detail: string | null } {
  const date = parseDay(day.date);
  const route = dayRoute(day.slots);
  if (!date) return { title: `Day ${day.day}`, detail: route };
  const dayMonth = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return { title: WEEKDAYS[date.getUTCDay()], detail: route ? `${dayMonth} · ${route}` : dayMonth };
}

/**
 * Where the day goes, from the neighborhoods of its places in order: "Roma
 * Norte" when it stays in one, "Roma Norte to Condesa" from the first to
 * the last. Null without neighborhoods.
 */
export function dayRoute(slots: readonly SharedTripSlot[]): string | null {
  const names = slots.map((slot) => slot.place?.neighborhood?.trim()).filter((name): name is string => Boolean(name));
  const first = names[0];
  const last = names.at(-1);
  if (!first || !last) return null;
  return first === last ? first : `${first} to ${last}`;
}

/** Nights between the trip dates, or null without both. */
export function nightsOf(startDate?: string, endDate?: string): number | null {
  const start = parseDay(startDate);
  const end = parseDay(endDate);
  if (!start || !end || end <= start) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

const SLOT_LABELS: Record<SlotName, string> = {
  breakfast: "Breakfast",
  morning: "Morning",
  lunch: "Lunch",
  afternoon: "Afternoon",
  dinner: "Dinner",
  night: "Night",
  stay: "Stay",
};

export function slotLabel(slot: SlotName): string {
  return SLOT_LABELS[slot];
}

/** "Dinner · Encarnação": the slot and, when we have it, the neighborhood. */
export function slotLine(slot: SharedTripSlot): string {
  const neighborhood = slot.place?.neighborhood?.trim();
  return neighborhood ? `${slotLabel(slot.slot)} · ${neighborhood}` : slotLabel(slot.slot);
}

// ---------------------------------------------------------- page structure

export type StayEntry = { place: SharedTripPlace; advisorNote?: string };

function isStay(slot: SharedTripSlot): boolean {
  return slot.slot === "stay" || slot.place?.category === "stay";
}

/**
 * The page's two parts: the days with their places (stays taken out, days
 * left empty dropped, so free days stay hidden) and the stays, once per
 * place, in the order they first appear.
 */
export function splitStays(view: Pick<SharedTripView, "days">): { days: SharedTripDay[]; stays: StayEntry[] } {
  const stays: StayEntry[] = [];
  const seen = new Set<string>();
  const days: SharedTripDay[] = [];
  for (const day of view.days) {
    const slots: SharedTripSlot[] = [];
    for (const slot of day.slots) {
      if (!isStay(slot)) {
        slots.push(slot);
        continue;
      }
      if (!slot.place) {
        // A note on an empty stay slot still belongs to the day.
        if (slot.advisorNote) slots.push(slot);
        continue;
      }
      const key = slot.place.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      stays.push({ place: slot.place, ...(slot.advisorNote ? { advisorNote: slot.advisorNote } : {}) });
    }
    if (slots.length > 0) days.push({ ...day, slots });
  }
  return { days, stays };
}

/**
 * How a day is laid out: "stack" gives every place a wide block with one to
 * three photos, "row" sets two or three places side by side with one photo
 * each. Rows alternate with stacks so the page keeps a rhythm.
 */
export function dayLayouts(days: readonly SharedTripDay[]): ("stack" | "row")[] {
  return days.map((day, index) => {
    const places = day.slots.filter((slot) => slot.place).length;
    return index % 2 === 1 && places >= 2 && places <= 3 && places === day.slots.length ? "row" : "stack";
  });
}

export type PhotoFrame = { src: string; ratio: string; grow: number; mobileRatio: string };

// Each photo set keeps one height on wide screens: a frame's grow is its
// aspect ratio. Sets rotate per block so neighbors do not repeat.
const PAIRS: readonly (readonly [number, number, string][])[] = [
  [
    [4, 3, "4 / 3"],
    [3, 2, "3 / 2"],
  ],
  [
    [1, 1, "1 / 1"],
    [3, 2, "3 / 2"],
  ],
  [
    [16, 9, "16 / 9"],
    [1, 1, "1 / 1"],
  ],
];
const TRIPLE: readonly [number, number, string][] = [
  [3, 2, "3 / 2"],
  [4, 5, "4 / 5"],
  [1, 1, "1 / 1"],
];
const SINGLE: readonly [number, number, string][] = [[2, 1, "2 / 1"]];

/**
 * The frames of one block's photos (one to three). On phones the first
 * photo runs full width and the rest share the row below it.
 */
export function photoFrames(images: readonly string[], blockIndex: number): PhotoFrame[] {
  const shown = images.slice(0, 3);
  const set =
    shown.length >= 3 ? TRIPLE : shown.length === 2 ? PAIRS[blockIndex % PAIRS.length] : shown.length === 1 ? SINGLE : [];
  return shown.map((src, index) => {
    const [w, h, ratio] = set[index] ?? [1, 1, "1 / 1"];
    const mobileRatio = index === 0 ? "4 / 3" : shown.length === 2 ? "3 / 2" : "1 / 1";
    return { src, ratio, grow: Math.round((w / h) * 10_000) / 10_000, mobileRatio };
  });
}

/** One photo per place in a row of two or three: square, tall, portrait. */
export function rowFrames(count: number): { ratio: string; grow: number }[] {
  const all = [
    { ratio: "1 / 1", grow: 1 },
    { ratio: "9 / 16", grow: 0.5625 },
    { ratio: "3 / 4", grow: 0.75 },
  ];
  return count === 2 ? [all[0], all[2]] : all.slice(0, count);
}

/** A place's photos: `images` when present, else the single `imageUrl`. */
export function placeImages(place: Pick<SharedTripPlace, "images" | "imageUrl">): string[] {
  if (place.images && place.images.length > 0) return place.images;
  return place.imageUrl ? [place.imageUrl] : [];
}

// The provider's stored 420 px images are stretched up to six times here.
const PROVIDER_FRAME_WIDTH = 1600;
const PROVIDER_LARGE_WIDTH = 2400;

export type PhotoCreditFacts = { author?: string; authorUri?: string };
export type FramePhoto = { src: string; credit?: PhotoCreditFacts };

/**
 * What a frame loads for one of a place's photos. `large` is for a frame most
 * of the page wide or tall. A Google photo brings its larger copy and the
 * credit it must carry; a provider image is asked for at the frame's size.
 */
export function framePhoto(place: Pick<SharedTripPlace, "googlePhotos">, src: string, large: boolean): FramePhoto {
  const google = place.googlePhotos?.[src];
  if (!google) return { src: providerImageAt(src, large ? PROVIDER_LARGE_WIDTH : PROVIDER_FRAME_WIDTH) };
  const { fullSrc, ...credit } = google;
  return { src: large ? fullSrc : src, credit };
}

export type HeroImage = { src: string; alt: string; photo: FramePhoto; cover?: TripCover };

function heroOf(place: SharedTripPlace, src: string): HeroImage {
  return { src, alt: place.name, photo: framePhoto(place, src, true) };
}

/**
 * The hero of the page: the trip's cover. Without one, the first photo of the
 * first place, in itinerary order, that has a second photo to keep for its own
 * block, so the page does not open with the same photo twice. Else the last
 * place's photo. `src` is the photo's url in `images`, what `withoutHero`
 * matches on.
 */
export function heroImage(view: Pick<SharedTripView, "days" | "cover">): HeroImage | null {
  if (view.cover) return { src: view.cover.url, alt: view.cover.alt, photo: { src: view.cover.url }, cover: view.cover };
  let fallback: HeroImage | null = null;
  for (const day of view.days) {
    for (const slot of day.slots) {
      const images = slot.place ? placeImages(slot.place) : [];
      if (!slot.place || !images[0]) continue;
      if (images.length >= 2) return heroOf(slot.place, images[0]);
      // The last place's photo: it repeats far down the page, not right under the hero.
      fallback = heroOf(slot.place, images[0]);
    }
  }
  return fallback;
}

/**
 * A block's photos without the one the hero already shows, unless that
 * would leave the block with none.
 */
export function withoutHero(images: readonly string[], heroSrc: string | undefined): string[] {
  const rest = images.filter((src) => src !== heroSrc);
  return rest.length > 0 ? rest : [...images];
}

export function placeCount(view: Pick<SharedTripView, "days">): number {
  return view.days.reduce((sum, day) => sum + day.slots.filter((slot) => slot.place).length, 0);
}

/**
 * The traveler's favorites that drove the picks, most influential first:
 * the server's list with photos when it sent one, else the names summed
 * from each place's explainability.
 */
export function favoritesBehind(view: Pick<SharedTripView, "days" | "favorites">, limit = 5): SharedFavorite[] {
  if (view.favorites && view.favorites.length > 0) return view.favorites.filter(isNamedFavorite).slice(0, limit);
  const totals = new Map<string, number>();
  for (const day of view.days) {
    for (const slot of day.slots) {
      for (const item of slot.place?.because ?? []) {
        if (!isNamedFavorite(item)) continue;
        const name = item.name.trim();
        totals.set(name, (totals.get(name) ?? 0) + item.share);
      }
    }
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name]) => ({ name }));
}

/** The photo of a favorite by name, for the small round photo next to a reason. */
export function favoriteImage(favorites: readonly SharedFavorite[], name: string): string | undefined {
  const key = name.trim().toLowerCase();
  return favorites.find((favorite) => favorite.name.trim().toLowerCase() === key)?.imageUrl;
}

/**
 * The hero's intro: "Two days and eight places, matched to what you already
 * love: Via Carota, Lilia and Attaboy." Counts from the itinerary, names from
 * the favorites behind it; without favorites the advisor (or nobody) is
 * credited instead.
 */
export function heroIntro(view: Pick<SharedTripView, "days" | "advisorName" | "favorites">): string | null {
  const places = placeCount(view);
  if (places === 0) return null;
  const days = view.days.filter((day) => day.slots.some((slot) => slot.place)).length;
  const counts = `${countOf(days, "day", "days")} and ${countOf(places, "place", "places", false)}`;
  const names = favoritesBehind(view, 3).map((favorite) => favorite.name);
  if (names.length > 0) return `${counts}, matched to what you already love: ${joinNames(names)}.`;
  const advisor = view.advisorName?.trim();
  return advisor ? `${counts}, picked for you by ${advisor}.` : `${counts}, picked for you.`;
}

/**
 * The favorites band's heading. "Every place" only when every place on the
 * page names a favorite; an advisor's own pick with no favorite behind it
 * would make that untrue.
 */
export function bandHeading(view: Pick<SharedTripView, "days">): string {
  const places = view.days.flatMap((day) => day.slots.flatMap((slot) => (slot.place ? [slot.place] : [])));
  const allMatched = places.length > 0 && places.every((place) => place.because.some(isNamedFavorite));
  return allMatched
    ? "Every place here is matched to one you already love."
    : "Matched to the places you already love.";
}

/** "Four nights · 5-star hotel": what we know about a stay, or null. */
export function stayFacts(place: Pick<SharedTripPlace, "hotelClass">, nights: number | null): string | null {
  const parts = [
    ...(nights ? [countOf(nights, "night", "nights")] : []),
    ...(place.hotelClass ? [`${place.hotelClass}-star hotel`] : []),
  ];
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "oysters, grilled octopus, scallops" for "Order ...". */
export function dishList(dishes: readonly string[]): string {
  return dishes.map((dish) => dish.charAt(0).toLowerCase() + dish.slice(1)).join(", ");
}

/** The Open Graph description: "Daan planned your Mexico City days, 12 to 16 November, from the places you already love." */
export function shareDescription(
  view: Pick<SharedTripView, "advisorName" | "destinationName" | "startDate" | "endDate">,
): string {
  const dates = dateRangeLabel(view.startDate, view.endDate);
  const advisor = view.advisorName?.trim();
  const what = `your ${view.destinationName} days${dates ? `, ${dates},` : ""}`;
  return advisor
    ? `${advisor} planned ${what} from the places you already love.`
    : `Here are ${what} planned from the places you already love.`;
}
