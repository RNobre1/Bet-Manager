import { describe, it, expect, beforeEach } from "vitest";
import {
  queryFixtures,
  QUERY_FIXTURES_TOOL,
  type QueryFixturesArgs,
} from "./copilot-tools";

/**
 * Build a minimal Supabase-admin mock with a scripted in-memory row set.
 * The tool wraps the same `.from("fixtures").select().or().order()` pipeline
 * the repository uses; here we just hand back the canned rows regardless of
 * the actual filter chain — assertions are made on what queryFixtures DOES
 * with the rows, not on the SQL it generated.
 */
function buildAdmin(rows: unknown[]) {
  return {
    from(table: string) {
      if (table !== "fixtures") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          return this;
        },
        or() {
          return this;
        },
        order() {
          return this;
        },
        // Final terminator — `await` on the chain.
        then(resolve: (v: { data: unknown[]; error: null }) => void) {
          resolve({ data: rows, error: null });
        },
      };
    },
  };
}

function row(over: Record<string, unknown>): Record<string, unknown> {
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
    detail_json: null,
    ...over,
  };
}

describe("QUERY_FIXTURES_TOOL definition", () => {
  it("exposes a JSON schema with the expected filter params", () => {
    expect(QUERY_FIXTURES_TOOL.type).toBe("function");
    expect(QUERY_FIXTURES_TOOL.function.name).toBe("query_fixtures");
    const props = QUERY_FIXTURES_TOOL.function.parameters.properties as Record<
      string,
      unknown
    >;
    expect(props).toHaveProperty("date");
    expect(props).toHaveProperty("league_substr");
    expect(props).toHaveProperty("country");
    expect(props).toHaveProperty("only_with_badge");
    expect(props).toHaveProperty("limit");
  });
});

describe("queryFixtures — basics", () => {
  it("returns compact fixture entries from the admin client", async () => {
    const admin = buildAdmin([row({ id: 42, home_team: "Flamengo" })]);
    const out = await queryFixtures(
      { date: "today" } as QueryFixturesArgs,
      admin,
    );
    expect(out.fixtures).toHaveLength(1);
    expect(out.fixtures[0]).toMatchObject({
      id: 42,
      home_team: "Flamengo",
      away_team: "B",
      league: "Serie A",
      country: "brazil",
    });
  });

  it("normalizes today/tomorrow to the BRT calendar day", async () => {
    const admin = buildAdmin([row({})]);
    const today = await queryFixtures({ date: "today" }, admin);
    const tomorrow = await queryFixtures({ date: "tomorrow" }, admin);
    expect(today.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tomorrow.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(today.date).not.toBe(tomorrow.date);
  });

  it("accepts an explicit YYYY-MM-DD date string", async () => {
    const admin = buildAdmin([row({})]);
    const out = await queryFixtures({ date: "2026-05-20" }, admin);
    expect(out.date).toBe("2026-05-20");
  });
});

describe("queryFixtures — filters", () => {
  let admin: ReturnType<typeof buildAdmin>;
  beforeEach(() => {
    admin = buildAdmin([
      row({ id: 1, league: "Premier League", country: "england", home_team: "Arsenal" }),
      row({ id: 2, league: "Brasileirão Série A", country: "brazil", home_team: "Flamengo" }),
      row({
        id: 3,
        league: "La Liga",
        country: "spain",
        home_team: "Real Madrid",
        detail_json: {
          referee_record: {
            name: "Ref X",
            completed: 10,
            avg_total_booking_points: 50,
          },
          streaks: {
            home: [{ stat_type: "Over 2.5 Goals", overall_perc: 80 }],
            away: [{ stat_type: "Over 2.5 Goals", overall_perc: 78 }],
          },
        },
      }),
    ]);
  });

  it("filters by country (case-insensitive)", async () => {
    const out = await queryFixtures({ country: "BRAZIL" }, admin);
    expect(out.fixtures.map((f) => f.id)).toEqual([2]);
  });

  it("filters by league substring (case-insensitive)", async () => {
    const out = await queryFixtures({ league_substr: "premier" }, admin);
    expect(out.fixtures.map((f) => f.id)).toEqual([1]);
  });

  it("filters by badge id (only fixtures whose computed badges include it)", async () => {
    const out = await queryFixtures(
      { only_with_badge: "over-alto" },
      admin,
    );
    expect(out.fixtures.map((f) => f.id)).toEqual([3]);
    expect(out.fixtures[0].badges).toContainEqual(
      expect.objectContaining({ id: "over-alto" }),
    );
  });

  it("filters by min_referee_booking", async () => {
    const out = await queryFixtures({ min_referee_booking: 45 }, admin);
    expect(out.fixtures.map((f) => f.id)).toEqual([3]);
  });

  it("respects limit (default 50, cap at 50)", async () => {
    const many = Array.from({ length: 80 }).map((_, i) =>
      row({ id: i + 1 }),
    );
    const a = buildAdmin(many);
    const out = await queryFixtures({ limit: 10 }, a);
    expect(out.fixtures).toHaveLength(10);
    const a2 = buildAdmin(many);
    const out2 = await queryFixtures({ limit: 999 }, a2);
    expect(out2.fixtures.length).toBeLessThanOrEqual(50);
  });
});

describe("queryFixtures — compact signals shape", () => {
  it("attaches kickoff_brt (HH:MM) when kickoff_utc present", async () => {
    const admin = buildAdmin([
      row({ kickoff_utc: "2026-05-12T23:00:00Z" }),
    ]);
    const out = await queryFixtures({}, admin);
    expect(out.fixtures[0].kickoff_brt).toBe("20:00");
  });

  it("surfaces referee_avg_booking when detail has referee_record", async () => {
    const admin = buildAdmin([
      row({
        detail_json: {
          referee_record: {
            name: "X",
            completed: 8,
            avg_total_booking_points: 38.5,
          },
        },
      }),
    ]);
    const out = await queryFixtures({}, admin);
    expect(out.fixtures[0].referee_avg_booking).toBe(38.5);
  });

  it("omits detail_json from the output (token budget)", async () => {
    const admin = buildAdmin([
      row({ detail_json: { huge: "x".repeat(10000) } }),
    ]);
    const out = await queryFixtures({}, admin);
    expect(out.fixtures[0]).not.toHaveProperty("detail_json");
  });
});
