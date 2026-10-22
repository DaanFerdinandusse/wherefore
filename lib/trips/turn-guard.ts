import { getTableColumns, is, sql, SQL, type AnyColumn } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

// The chat turn guard for writes an agent tool makes (lib/agent/writes.ts).
// A tool write must land only while its turn still holds the chat's lock and
// no stop was requested. Checking first and writing after leaves a gap, so
// the check goes into the write statement itself:
//
//   insert ... select ... where exists (guard)
//   update ... where ... and exists (guard)
//
// The guard takes a share lock on the chat row, so a stop or a new turn that
// commits while the write runs either lands first (the write matches
// nothing) or waits until the write committed. Pure SQL builders, no db.

/** The turn a write belongs to. */
export type TurnGuard = { chatId: string; turnId: string };

/** The write matched nothing because the turn was stopped or replaced. */
export class TurnLostError extends Error {
  constructor() {
    super("The turn that made this change was stopped or replaced.");
    this.name = "TurnLostError";
  }
}

/**
 * `exists (the chat's lock is this turn and no stop was requested)`. With a
 * trip id the chat must also belong to that trip.
 */
export function turnGuardSql(turn: TurnGuard, tripId?: string | SQL): SQL {
  const trip = tripId === undefined ? sql`` : typeof tripId === "string" ? sql` and g.trip_id = ${tripId}::uuid` : sql` and g.trip_id = ${tripId}`;
  return sql`exists (
    select 1 from chats g
    where g.id = ${turn.chatId}::uuid
      and g.active_turn_id = ${turn.turnId}
      and g.stop_requested_at is null${trip}
    for share
  )`;
}

/** The guard when a turn is given, else `true` (writes from the UI). */
export function guardOrTrue(turn: TurnGuard | undefined, tripId?: string | SQL): SQL {
  return turn ? turnGuardSql(turn, tripId) : sql`true`;
}

function defaultFor(column: AnyColumn): SQL {
  const type = sql.raw(column.getSQLType());
  if (column.default !== undefined) {
    if (is(column.default, SQL)) return column.default;
    return sql`${sql.param(column.default, column)}::${type}`;
  }
  if (column.defaultFn) {
    const value = column.defaultFn();
    return is(value, SQL) ? value : sql`${sql.param(value, column)}::${type}`;
  }
  return sql`null::${type}`;
}

/**
 * The select list of an `insert into <table> select ...`, in the table's
 * column order (the order drizzle names the columns in). Columns without an
 * expression get their default. Throws for an expression naming no column.
 */
export function insertSelectList(table: PgTable, exprs: Record<string, SQL>): SQL {
  const columns = getTableColumns(table) as Record<string, AnyColumn>;
  for (const key of Object.keys(exprs)) {
    if (!(key in columns)) throw new Error(`insertSelectList: ${key} is not a column`);
  }
  const list = Object.entries(columns).map(([key, column]) => exprs[key] ?? defaultFor(column));
  return sql.join(list, sql`, `);
}

/** `select <list> from <from> where <where>` for `db.insert(table).select(...)`. */
export function insertSelect(table: PgTable, exprs: Record<string, SQL>, from: SQL, where: SQL): SQL {
  return sql`select ${insertSelectList(table, exprs)} from ${from} where ${where}`;
}
