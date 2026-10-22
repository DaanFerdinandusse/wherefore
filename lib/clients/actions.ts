"use server";

import { z } from "zod";

import { isAppError } from "@/lib/auth/errors";
import { type AuthUser, requireUser } from "@/lib/auth/server";
import type { MediaFavorite, TasteTag } from "@/lib/contracts";
import { getEntities, type NormalizedPlace, QlooError, searchEntities } from "@/lib/qloo";
import { upsertPlaces } from "@/lib/places";

import { type FavoriteTile, unmatchedCandidates } from "./candidates";
import type { ClientFavorite } from "./contracts";
import {
  addFavorite,
  createClient,
  removeFavorite,
  reorderFavorites,
  setGroundRules,
  setMediaFavorites,
  updateClientFields,
  updateFavorite,
} from "./mutations";
import { recomputeTasteTags } from "./taste";

// Server actions for the client profile: every edit in place lands here.
// Each one starts with requireUser() and passes the user as the scope, checks
// its input with Zod, and answers { ok, data } or { ok: false, error } with
// copy the profile can show as is, so a failure never throws into the UI.

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const SAVE_FAILED = "Could not save. Check your connection and try again.";
const SEARCH_FAILED = "Place search is unavailable right now. Try again in a moment.";
const INVALID = "That change could not be saved. Reload the page and try again.";

async function run<T>(work: (user: AuthUser) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const user = await requireUser();
    return { ok: true, data: await work(user) };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: INVALID };
    if (isAppError(error)) return { ok: false, error: error.message };
    if (error instanceof QlooError) {
      console.error("[clients] search failed", error);
      return { ok: false, error: SEARCH_FAILED };
    }
    console.error("[clients] action failed", error);
    return { ok: false, error: SAVE_FAILED };
  }
}

const id = z.uuid();
const name = z.string().trim().min(1, "Give the client a name.").max(120);
const near = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).nullish();
const query = z.string().trim().min(1).max(120);

const fieldsSchema = z
  .object({
    name,
    homeCity: z.string().trim().max(120).nullable(),
    homeLat: z.number().min(-90).max(90).nullable(),
    homeLon: z.number().min(-180).max(180).nullable(),
    notes: z.string().max(5000),
  })
  .partial();

export type ClientFieldsInput = z.input<typeof fieldsSchema>;

/** Creates the client on the first keystroke of the name (/clients/new). */
export async function createClientAction(input: ClientFieldsInput): Promise<ActionResult<{ id: string }>> {
  return run(async (user) => {
    const fields = fieldsSchema.extend({ name }).parse(input);
    const client = await createClient(
      {
        name: fields.name,
        homeCity: fields.homeCity || null,
        homeLat: fields.homeLat ?? null,
        homeLon: fields.homeLon ?? null,
        notes: fields.notes ?? "",
      },
      user,
    );
    return { id: client.id };
  });
}

/** Saves a debounced edit of the name, home city (with coordinates) or notes. */
export async function updateClientFieldsAction(clientId: string, input: ClientFieldsInput): Promise<ActionResult> {
  return run(async (user) => {
    const fields = fieldsSchema.parse(input);
    if (fields.homeCity === "") fields.homeCity = null;
    await updateClientFields(id.parse(clientId), fields, user);
    return undefined;
  });
}

function tileFromPlace(favorite: ClientFavorite, place: NormalizedPlace | null): FavoriteTile {
  return {
    id: favorite.id,
    query: favorite.query,
    match: favorite.match === "resolved" ? "resolved" : favorite.match === "weak" ? "weak" : "unmatched",
    name: place?.name ?? favorite.query,
    city: place?.city ?? null,
    imageUrl: place?.images[0]?.url ?? null,
    candidates: favorite.candidates,
  };
}

const PLACE_TYPE = "urn:entity:place";
// Same params as the picker's /api/entities/search call, so this is a cache hit.
const PICKER_TAKE = 5;

/**
 * The full place row for a picked result. The browser sends only the entity
 * id; the row comes from the server's own search (cached) or an entities
 * lookup, never from the client.
 */
async function placeFor(entityId: string, text: string, location: z.infer<typeof near>): Promise<NormalizedPlace> {
  const { candidates } = await searchEntities(text, {
    types: [PLACE_TYPE],
    take: PICKER_TAKE,
    ...(location ? { near: location } : {}),
  });
  const hit = candidates.find((candidate) => candidate.entityId === entityId)?.place;
  if (hit) return hit;
  const { places } = await getEntities([entityId]);
  const place = places[0];
  if (!place) throw new QlooError(`No place for entity ${entityId}`);
  return place;
}

async function savePlace(place: NormalizedPlace): Promise<string> {
  const ids = await upsertPlaces([place]);
  const placeId = ids[place.entityId];
  if (!placeId) throw new Error(`upsertPlaces returned no id for ${place.entityId}`);
  return placeId;
}

const pickSchema = z.object({ query, entityId: z.string().min(1).max(80), near });

/** Adds a favorite the advisor picked from the results: matched to that place. */
export async function addFavoriteAction(
  clientId: string,
  input: z.input<typeof pickSchema>,
): Promise<ActionResult<FavoriteTile>> {
  return run(async (user) => {
    const pick = pickSchema.parse(input);
    const place = await placeFor(pick.entityId, pick.query, pick.near);
    const placeId = await savePlace(place);
    const favorite = await addFavorite(
      id.parse(clientId),
      { query: pick.query, entityId: place.entityId, placeId, match: "resolved", candidates: [] },
      user,
    );
    return tileFromPlace(favorite, place);
  });
}

const typedSchema = z.object({ query, near });

/** Keeps what the advisor typed without a pick: an unmatched favorite with the top results to choose from later. */
export async function addUnmatchedFavoriteAction(
  clientId: string,
  input: z.input<typeof typedSchema>,
): Promise<ActionResult<FavoriteTile>> {
  return run(async (user) => {
    const typed = typedSchema.parse(input);
    const { candidates } = await searchEntities(typed.query, {
      types: [PLACE_TYPE],
      take: PICKER_TAKE,
      ...(typed.near ? { near: typed.near } : {}),
    });
    const favorite = await addFavorite(
      id.parse(clientId),
      { query: typed.query, match: "unmatched", candidates: unmatchedCandidates(candidates) },
      user,
    );
    return tileFromPlace(favorite, null);
  });
}

const resolveSchema = z.object({ query, entityId: z.string().min(1).max(80), near });

/** Matches an unmatched favorite to one of its candidates. */
export async function resolveFavoriteAction(
  favoriteId: string,
  input: z.input<typeof resolveSchema>,
): Promise<ActionResult<FavoriteTile>> {
  return run(async (user) => {
    const pick = resolveSchema.parse(input);
    const place = await placeFor(pick.entityId, pick.query, pick.near);
    const placeId = await savePlace(place);
    const favorite = await updateFavorite(
      id.parse(favoriteId),
      { entityId: place.entityId, placeId, match: "resolved", candidates: [] },
      user,
    );
    return tileFromPlace(favorite, place);
  });
}

export async function removeFavoriteAction(favoriteId: string): Promise<ActionResult> {
  return run(async (user) => {
    await removeFavorite(id.parse(favoriteId), user);
    return undefined;
  });
}

/** Saves the grid order after a drag. */
export async function reorderFavoritesAction(clientId: string, favoriteIds: string[]): Promise<ActionResult> {
  return run(async (user) => {
    await reorderFavorites(id.parse(clientId), z.array(id).max(200).parse(favoriteIds), user);
    return undefined;
  });
}

/** Recomputes the taste tags from the matched favorites (debounced by the profile). */
export async function recomputeTasteTagsAction(clientId: string): Promise<ActionResult<TasteTag[]>> {
  return run((user) => recomputeTasteTags(id.parse(clientId), user));
}

const rulesSchema = z.array(z.string().trim().min(1).max(80)).max(30);

export async function setGroundRulesAction(clientId: string, rules: string[]): Promise<ActionResult<string[]>> {
  return run(async (user) => {
    const client = await setGroundRules(id.parse(clientId), rulesSchema.parse(rules), user);
    return client.groundRules;
  });
}

const mediaSchema = z
  .array(
    z.object({
      query: z.string().trim().min(1).max(120),
      kind: z.enum(["artist", "movie", "book"]),
      entityId: z.string().min(1).max(80).optional(),
      name: z.string().max(200).optional(),
      imageUrl: z.url().max(1000).optional(),
    }),
  )
  .max(30);

export async function setMediaFavoritesAction(
  clientId: string,
  media: MediaFavorite[],
): Promise<ActionResult<MediaFavorite[]>> {
  return run(async (user) => {
    const client = await setMediaFavorites(id.parse(clientId), mediaSchema.parse(media), user);
    return client.mediaFavorites;
  });
}
