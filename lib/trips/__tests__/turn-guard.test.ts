import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { tripCalls } from "@/lib/db/schema";

import { beatsEvidence, signalSetHash } from "../evidence";
import { guardOrTrue, insertSelect, insertSelectList, turnGuardSql } from "../turn-guard";

const dialect = new PgDialect();
const render = (query: Parameters<PgDialect["sqlToQuery"]>[0]) => dialect.sqlToQuery(query);
const flat = (text: string) => text.replace(/\s+/g, " ").trim();

describe("turnGuardSql", () => {
  it("checks the lock and the stop flag in one exists, with a share lock on the chat", () => {
    const { sql: text, params } = render(turnGuardSql({ chatId: "c-1", turnId: "t-1" }, "trip-1"));
    expect(flat(text)).toBe(
      "exists ( select 1 from chats g where g.id = $1::uuid and g.active_turn_id = $2 and g.stop_requested_at is null and g.trip_id = $3::uuid for share )",
    );
    expect(params).toEqual(["c-1", "t-1", "trip-1"]);
  });

  it("can compare the trip to a column, and is plain true without a turn", () => {
    expect(flat(render(turnGuardSql({ chatId: "c", turnId: "t" }, sql`x.trip_id`)).sql)).toContain("and g.trip_id = x.trip_id");
    expect(render(guardOrTrue(undefined)).sql).toBe("true");
  });
});

describe("insertSelect", () => {
  it("lists every column in table order, defaults for the ones not given", () => {
    const { sql: text } = render(
      insertSelect(tripCalls, { tripId: sql`$trip`, endpoint: sql`'e'` }, sql`(select 1) as one`, sql`true`),
    );
    const list = flat(text);
    // id, trip_id, endpoint, params, count, ms, loosened, source, tool_call_id, step, idx, created_at
    expect(list).toMatch(/^select gen_random_uuid\(\), \$trip, 'e', \$1::jsonb, \$2::integer, \$3::integer, \$4::jsonb, \$5::text, null::text, null::text, null::integer, now\(\) from \(select 1\) as one where true$/);
  });

  it("refuses an expression for a column the table does not have", () => {
    expect(() => insertSelectList(tripCalls, { nope: sql`1` })).toThrow(/not a column/);
  });
});

describe("evidence", () => {
  it("hashes a signal set independent of order and duplicates", () => {
    expect(signalSetHash(["b", "a", "a"])).toBe(signalSetHash(["a", "b"]));
    expect(signalSetHash(["a", "b"])).not.toBe(signalSetHash(["a", "c"]));
    expect(signalSetHash([])).toBeUndefined();
  });

  it("compares affinities within one signal set, never a smaller set's rank", () => {
    const h = "s2-x";
    // A 99 from a two-place set does not beat a higher affinity with a lower rank score.
    expect(beatsEvidence({ affinity: 0.71, score: 99, signalHash: h }, { affinity: 0.8, score: 80, signalHash: h })).toBe(false);
    expect(beatsEvidence({ affinity: 0.82, score: 70, signalHash: h }, { affinity: 0.8, score: 80, signalHash: h })).toBe(true);
    // A newer signal set replaces the old evidence.
    expect(beatsEvidence({ affinity: 0.5, score: 60, signalHash: "s3-y" }, { affinity: 0.8, score: 90, signalHash: h })).toBe(true);
    // An affinity beats none; without affinities the score decides.
    expect(beatsEvidence({ affinity: 0.1, score: 10 }, { score: 90 })).toBe(true);
    expect(beatsEvidence({ score: 95 }, { score: 90 })).toBe(true);
    expect(beatsEvidence({ score: 95 }, { affinity: 0.3, score: 50 })).toBe(false);
  });
});
