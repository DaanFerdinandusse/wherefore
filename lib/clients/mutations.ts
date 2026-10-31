import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";

import { NotFoundError } from "@/lib/auth/errors";
import { inScope, isUuid, toScope, type ScopeInput } from "@/lib/auth/scope";
import { db } from "@/lib/db";
import { clientFavorites, clients, trips } from "@/lib/db/schema";

import type {
  AddFavorite,
  AddFavorites,
  ArchiveClient,
  Client,
  CreateClient,
  RemoveFavorite,
  ReorderFavorites,
  SetGroundRules,
  SetMediaFavorites,
  SetTasteTags,
  UpdateClientFields,
  UpdateFavorite,
} from "./contracts";

// Writes for clients and their favorites. Every write that can change a search
// input ends with the same statement, `refreshClientSearch`, inside the same
// db.batch (one transaction over HTTP), so `clients.search` is never stale.

/** clients.search = name + home city + notes, rebuilt from the row itself. */
export function refreshClientSearch(where: SQL) {
  return db
    .update(clients)
    .set({
      search: sql`concat_ws(' ', ${clients.name}, ${clients.homeCity}, nullif(${clients.notes}, ''))`,
    })
    .where(where)
    .returning();
}

function ownedClient(id: string, scope: ScopeInput): SQL {
  return and(eq(clients.id, id), inScope(clients, scope)) as SQL;
}

function ownedClientIds(scope: ScopeInput) {
  return db.select({ id: clients.id }).from(clients).where(inScope(clients, scope));
}

async function requireClientId(id: string, scope: ScopeInput): Promise<void> {
  if (!isUuid(id)) throw new NotFoundError("client");
  const [row] = await db.select({ id: clients.id }).from(clients).where(ownedClient(id, scope)).limit(1);
  if (!row) throw new NotFoundError("client");
}

function single(rows: Client[]): Client {
  const row = rows[0];
  if (!row) throw new NotFoundError("client");
  return row;
}

export const createClient: CreateClient = async (input, scope) => {
  const { ownerId, orgId } = toScope(scope);
  const id = randomUUID();
  const [, refreshed] = await db.batch([
    db.insert(clients).values({
      id,
      ownerId,
      orgId,
      name: input.name.trim(),
      homeCity: input.homeCity ?? null,
      homeLat: input.homeLat ?? null,
      homeLon: input.homeLon ?? null,
      email: input.email ?? null,
      avatarUrl: input.avatarUrl ?? null,
      notes: input.notes ?? "",
      status: input.status ?? "active",
      groundRules: input.groundRules ?? [],
      mediaFavorites: input.mediaFavorites ?? [],
    }),
    refreshClientSearch(eq(clients.id, id)),
  ]);
  return single(refreshed);
};

export const updateClientFields: UpdateClientFields = async (id, patch, scope) => {
  if (!isUuid(id)) throw new NotFoundError("client");
  const where = ownedClient(id, scope);
  const name = patch.name?.trim();

  const update = db
    .update(clients)
    .set({ ...patch, ...(name !== undefined ? { name } : {}), updatedAt: sql`now()` })
    .where(where);

  if (name === undefined) {
    const [, refreshed] = await db.batch([update, refreshClientSearch(where)]);
    return single(refreshed);
  }

  // A rename rewrites the denormalized name on the client's trips too.
  const [, refreshed] = await db.batch([
    update,
    refreshClientSearch(where),
    db
      .update(trips)
      .set({
        clientName: name,
        search: sql`concat_ws(' ', ${trips.title}, ${name}::text, ${trips.destination} ->> 'name')`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(trips.clientId, id), inScope(trips, scope))),
  ]);
  return single(refreshed);
};

export const archiveClient: ArchiveClient = (id, scope) =>
  updateClientFields(id, { status: "archived" }, scope);

export const addFavorite: AddFavorite = async (clientId, input, scope) => {
  await requireClientId(clientId, scope);
  const [row] = await db
    .insert(clientFavorites)
    .values({
      clientId,
      query: input.query.trim(),
      entityId: input.entityId ?? null,
      placeId: input.placeId ?? null,
      match: input.match,
      candidates: input.candidates,
      position: sql`(select coalesce(max(position) + 1, 0) from client_favorites where client_id = ${clientId})`,
    })
    .returning();
  if (!row) throw new NotFoundError("client");
  return row;
};

export const addFavorites: AddFavorites = async (clientId, inputs, scope) => {
  await requireClientId(clientId, scope);
  if (inputs.length === 0) return [];
  const [last] = await db
    .select({ position: sql<number>`coalesce(max(${clientFavorites.position}) + 1, 0)` })
    .from(clientFavorites)
    .where(eq(clientFavorites.clientId, clientId));
  const start = Number(last?.position ?? 0);
  const rows = await db
    .insert(clientFavorites)
    .values(
      inputs.map((input, index) => ({
        clientId,
        query: input.query.trim(),
        entityId: input.entityId ?? null,
        placeId: input.placeId ?? null,
        match: input.match,
        candidates: input.candidates,
        position: start + index,
      })),
    )
    .returning();
  return rows.sort((a, b) => a.position - b.position);
};

export const updateFavorite: UpdateFavorite = async (favoriteId, patch, scope) => {
  if (!isUuid(favoriteId)) throw new NotFoundError("favorite");
  const [row] = await db
    .update(clientFavorites)
    .set({ ...patch, updatedAt: sql`now()` })
    .where(and(eq(clientFavorites.id, favoriteId), inArray(clientFavorites.clientId, ownedClientIds(scope))))
    .returning();
  if (!row) throw new NotFoundError("favorite");
  return row;
};

export const removeFavorite: RemoveFavorite = async (favoriteId, scope) => {
  if (!isUuid(favoriteId)) throw new NotFoundError("favorite");
  const rows = await db
    .delete(clientFavorites)
    .where(and(eq(clientFavorites.id, favoriteId), inArray(clientFavorites.clientId, ownedClientIds(scope))))
    .returning({ id: clientFavorites.id });
  if (rows.length === 0) throw new NotFoundError("favorite");
};

export const reorderFavorites: ReorderFavorites = async (clientId, favoriteIds, scope) => {
  await requireClientId(clientId, scope);
  const ids = favoriteIds.filter(isUuid);
  if (ids.length === 0) return;
  const list = sql.join(
    ids.map((id) => sql`${id}`),
    sql`, `,
  );
  await db.execute(sql`
    update client_favorites f
    set position = v.ord - 1, updated_at = now()
    from unnest(array[${list}]::uuid[]) with ordinality as v(id, ord)
    where f.id = v.id and f.client_id = ${clientId}
  `);
};

async function setClientColumn(
  clientId: string,
  scope: ScopeInput,
  set: PgUpdateSetSource<typeof clients>,
): Promise<Client> {
  if (!isUuid(clientId)) throw new NotFoundError("client");
  const rows = await db
    .update(clients)
    .set({ ...set, updatedAt: sql`now()` })
    .where(ownedClient(clientId, scope))
    .returning();
  return single(rows);
}

export const setTasteTags: SetTasteTags = (clientId, tags, scope) =>
  setClientColumn(clientId, scope, { tasteTags: tags, tasteTagsAt: sql`now()` });

export const setGroundRules: SetGroundRules = (clientId, rules, scope) =>
  setClientColumn(clientId, scope, {
    groundRules: rules.map((rule) => rule.trim()).filter(Boolean),
  });

export const setMediaFavorites: SetMediaFavorites = (clientId, media, scope) =>
  setClientColumn(clientId, scope, { mediaFavorites: media });
