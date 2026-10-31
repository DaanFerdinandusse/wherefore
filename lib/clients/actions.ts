"use server";

import { after } from "next/server";
import { z } from "zod";

import { isAppError } from "@/lib/auth/errors";
import { type AuthUser, requireUser } from "@/lib/auth/server";
import type { MediaFavorite, TasteTag } from "@/lib/contracts";
import { readSharedList } from "@/lib/google/shared-list";
import { getEntities, type NormalizedPlace, QlooError, searchEntities } from "@/lib/qloo";
import { upsertPlaces } from "@/lib/places";

import { type FavoriteTile, unmatchedCandidates } from "./candidates";
import type { ClientFavorite } from "./contracts";
import { exactMatch, LIST_IMPORT_BATCH, spreadByArea, type ListPlaceRef } from "./list-import";
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
import { listFavorites } from "./queries";
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
/** A shared list holds up to 500 places. */
const MAX_REORDERED = 1000;

const fieldsSchema = z
  .object({
    name,
    homeCity: z.string().trim().max(120).nullable(),
    homeLat: z.number().min(-90).max(90).nullable(),
    homeLon: z.number().min(-180).max(180).nullable(),
    email: z.union([z.literal(""), z.email().max(200)]).nullable(),
    notes: z.string().max(5000),
  })
  .partial();

export type ClientFieldsInput = z.input<typeof fieldsSchema>;

const newClientSchema = z.object({
  name,
  homeCity: z.string().trim().max(120).nullable(),
  homeLat: z.number().min(-90).max(90).nullable(),
  homeLon: z.number().min(-180).max(180).nullable(),
  email: z.union([z.literal(""), z.email().max(200)]).nullable(),
  favorites: z.array(z.object({ query, entityId: z.string().min(1).max(80), near })).max(50),
});

export type NewClientInput = z.input<typeof newClientSchema>;

/**
 * C1 New client: creates the client with the places the advisor picked, in
 * order. Each pick resolves to its place on the server (a cache hit of the
 * picker's own search); a pick that no longer resolves is kept as typed, as
 * an unmatched favorite. Taste tags are computed after the response.
 */
export async function createClientWithFavoritesAction(input: NewClientInput): Promise<ActionResult<{ id: string }>> {
  return run(async (user) => {
    const fields = newClientSchema.parse(input);
    const client = await createClient(
      {
        name: fields.name,
        homeCity: fields.homeCity || null,
        homeLat: fields.homeLat,
        homeLon: fields.homeLon,
        email: fields.email || null,
      },
      user,
    );

    const seen = new Set<string>();
    let matched = 0;
    for (const pick of fields.favorites) {
      if (seen.has(pick.entityId)) continue;
      seen.add(pick.entityId);
      const place = await placeFor(pick.entityId, pick.query, pick.near).catch((error: unknown) => {
        console.warn("[clients] a new client's favorite did not resolve", pick.entityId, error);
        return null;
      });
      if (place) {
        const placeId = await savePlace(place);
        await addFavorite(
          client.id,
          { query: pick.query, entityId: place.entityId, placeId, match: "resolved", candidates: [] },
          user,
        );
        matched += 1;
      } else {
        await addFavorite(client.id, { query: pick.query, match: "unmatched", candidates: [] }, user);
      }
    }

    if (matched > 0) {
      after(async () => {
        await recomputeTasteTags(client.id, user).catch((error: unknown) =>
          console.error("[clients] taste tags after create failed", error),
        );
      });
    }
    return { id: client.id };
  });
}

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
        email: fields.email || null,
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
    if (fields.email === "") fields.email = null;
    await updateClientFields(id.parse(clientId), fields, user);
    return undefined;
  });
}

function tileFromPlace(favorite: ClientFavorite, place: NormalizedPlace | null): FavoriteTile {
  return {
    id: favorite.id,
    query: favorite.query,
    entityId: favorite.entityId,
    match: favorite.match === "resolved" ? "resolved" : favorite.match === "weak" ? "weak" : "unmatched",
    name: place?.name ?? favorite.query,
    city: place?.city ?? null,
    imageUrl: place?.images[0]?.url ?? null,
    primaryType: place?.primaryType ?? null,
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
    await reorderFavorites(id.parse(clientId), z.array(id).max(MAX_REORDERED).parse(favoriteIds), user);
    return undefined;
  });
}

const linkSchema = z.string().trim().min(1).max(2000);

/** Reads a shared Google Maps list, its places in the order they will be saved. */
export async function readSharedListAction(pasted: string): Promise<ActionResult<{ title: string; places: ListPlaceRef[] }>> {
  return run(async () => {
    const list = await readSharedList(linkSchema.parse(pasted));
    return { title: list.title, places: spreadByArea(list.places) };
  });
}

const listBatchSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1).max(300),
      lat: z.number().min(-90).max(90),
      lon: z.number().min(-180).max(180),
      googleId: z.string().regex(/^\d{1,20}$/).nullable(),
    }),
  )
  .min(1)
  .max(LIST_IMPORT_BATCH);

/**
 * Saves the places of one batch that match exactly, one search at a time (the
 * upstream drops parallel calls), and leaves the rest out. A place the client
 * already has counts as matched and stays as it is, so an import can run twice.
 */
export async function importListPlacesAction(
  clientId: string,
  input: z.input<typeof listBatchSchema>,
): Promise<ActionResult<{ added: FavoriteTile[]; matched: number }>> {
  return run(async (user) => {
    const owner = id.parse(clientId);
    const batch = listBatchSchema.parse(input);
    const saved = new Set((await listFavorites(owner, user)).flatMap((favorite) => favorite.entityId ?? []));
    const added: FavoriteTile[] = [];
    let matched = 0;
    let failed = 0;
    let failure: unknown;
    for (const item of batch) {
      const search = await searchEntities(item.name.slice(0, 120), {
        types: [PLACE_TYPE],
        take: PICKER_TAKE,
        near: { lat: item.lat, lon: item.lon },
      }).catch((error: unknown) => {
        console.warn("[clients] a list place could not be searched", item.name, error);
        failure = error;
        failed += 1;
        return null;
      });
      const place = search ? exactMatch(item, search.candidates) : null;
      if (!place) continue;
      matched += 1;
      if (saved.has(place.entityId)) continue;
      saved.add(place.entityId);
      const placeId = await savePlace(place);
      const favorite = await addFavorite(owner, { query: item.name, entityId: place.entityId, placeId, match: "resolved", candidates: [] }, user);
      added.push(tileFromPlace(favorite, place));
    }
    // One place can miss; a whole batch missing means the search is down, not that nothing matched.
    if (failed === batch.length) throw failure;
    return { added, matched };
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
