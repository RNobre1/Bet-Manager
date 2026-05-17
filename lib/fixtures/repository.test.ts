import { describe, it, expect } from "vitest";
import { fixturesForBrtDay } from "./repository";
import { computeBadges } from "./badges";

/**
 * Mock the supabase chain `.from().select().or().order().order().order()`
 * resolving (thenable) to `{ data, error }`. The mock CAPTURES the string
 * passed to `.select(...)` so the regression test can assert the bug fix:
 * the giant `detail_json` blob column must NOT be selected anymore.
 */
function buildMock(rows: unknown[]) {
  const captured: { select?: string } = {};
  const chain = {
    select(arg: string) {
      captured.select = arg;
      return this;
    },
    or() {
      return this;
    },
    order() {
      return this;
    },
    then(resolve: (v: { data: unknown[]; error: null }) => void) {
      resolve({ data: rows, error: null });
    },
  };
  const client = {
    from(table: string) {
      if (table !== "fixtures") throw new Error(`unexpected table: ${table}`);
      return chain;
    },
  };
  return { client, captured };
}

/** A row shaped like the NEW compact select (aliased JSON sub-paths). */
function compactRow(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    match_date: "2026-05-12",
    ko_time: "20:00",
    home_team: "A",
    away_team: "B",
    league: "Serie A",
    country: "brazil",
    source_url: null,
    kickoff_utc: "2026-05-12T23:00:00Z",
    rd_referee: null,
    rd_streaks: null,
    rd_probe: null,
    ...over,
  };
}

describe("fixturesForBrtDay — payload regression (outage 1101)", () => {
  it("does NOT select the standalone detail_json blob column", async () => {
    const { client, captured } = buildMock([]);
    await fixturesForBrtDay("2026-05-12", client);

    expect(captured.select).toBeDefined();
    const sel = captured.select as string;

    // A standalone `detail_json` column token (not part of a `detail_json->` path).
    // Matches `detail_json` NOT immediately followed by `->`.
    expect(sel).not.toMatch(/detail_json(?!->)/);

    // And it MUST select the cheap sub-paths used by computeBadges + the probe.
    expect(sel).toContain("detail_json->referee_record");
    expect(sel).toContain("detail_json->streaks");
  });
});

describe("fixturesForBrtDay — DTO contract preserved", () => {
  it("computes badges from referee_record + streaks sub-paths", async () => {
    const refereeRecord = {
      name: "Ref X",
      completed: 10,
      avg_total_booking_points: 50,
    };
    const streaks = {
      home: [{ stat_type: "Over 2.5 Goals", overall_perc: 80 }],
      away: [{ stat_type: "Over 2.5 Goals", overall_perc: 78 }],
    };
    const { client } = buildMock([
      compactRow({
        id: 7,
        rd_referee: refereeRecord,
        rd_streaks: streaks,
        rd_probe: { foo: "bar" },
      }),
    ]);

    const out = await fixturesForBrtDay("2026-05-12", client);
    expect(out).toHaveLength(1);
    const dto = out[0];

    const expectedBadges = computeBadges({
      referee_record: refereeRecord,
      streaks,
    });
    expect(expectedBadges.length).toBeGreaterThan(0);
    expect(dto.badges).toEqual(expectedBadges);
    expect(dto.has_detail).toBe(true);

    // Scalar fields intact.
    expect(dto.id).toBe(7);
    expect(dto.match_date).toBe("2026-05-12");
    expect(dto.ko_time).toBe("20:00");
    expect(dto.home_team).toBe("A");
    expect(dto.away_team).toBe("B");
    expect(dto.league).toBe("Serie A");
    expect(dto.country).toBe("brazil");
    expect(dto.source_url).toBeNull();
    expect(dto.kickoff_utc).toBe("2026-05-12T23:00:00Z");
    // No raw blob leaks into the DTO.
    expect(dto).not.toHaveProperty("detail_json");
  });

  it("has_detail false and no badges when all detail sub-paths null", async () => {
    const { client } = buildMock([
      compactRow({ id: 9, rd_referee: null, rd_streaks: null, rd_probe: null }),
    ]);
    const out = await fixturesForBrtDay("2026-05-12", client);
    expect(out).toHaveLength(1);
    expect(out[0].has_detail).toBe(false);
    expect(out[0]).not.toHaveProperty("badges");
  });

  it("has_detail true when only the probe (team_record) is present", async () => {
    const { client } = buildMock([
      compactRow({
        id: 10,
        rd_referee: null,
        rd_streaks: null,
        rd_probe: { last5: [] },
      }),
    ]);
    const out = await fixturesForBrtDay("2026-05-12", client);
    expect(out[0].has_detail).toBe(true);
    expect(out[0]).not.toHaveProperty("badges");
  });

  it("orders by kickoff_utc asc (nulls last), then ko_time, then id", async () => {
    const { client } = buildMock([
      compactRow({ id: 3, kickoff_utc: null, ko_time: "22:00" }),
      compactRow({ id: 2, kickoff_utc: "2026-05-12T23:00:00Z" }),
      compactRow({ id: 1, kickoff_utc: "2026-05-12T21:00:00Z" }),
    ]);
    const out = await fixturesForBrtDay("2026-05-12", client);
    expect(out.map((f) => f.id)).toEqual([1, 2, 3]);
  });
});
