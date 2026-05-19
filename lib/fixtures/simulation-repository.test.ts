import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getFixtureSimulation } from "./simulation-repository";

/**
 * `fixture_simulations` reader — scalar-only contract (B12/B14/outage 1101).
 *
 * The Cloudflare Worker crashes (Error 1101) whenever a query pulls the heavy
 * `fixtures.detail_json` blob. `simulation-repository.ts` reads a SEPARATE
 * table whose jsonb fields (`top_scorelines`, `sim_stats`, `market_anchor`,
 * `player_events`) ARE the small simulation result itself — selecting them is
 * fine. What is forbidden is any reference to the heavy `detail_json` blob.
 *
 * Two layers of assertion mirror `repository-payload-guard.test.ts`:
 *   1. A static source scan: no bare `detail_json` token anywhere in any
 *      `.select(...)` literal (the T5 guard will later scan this file too).
 *   2. A behavioural mock asserting the captured select string + DTO mapping
 *      + graceful degradation.
 */

const SOURCE = readFileSync(
  join(__dirname, "simulation-repository.ts"),
  "utf8",
);

/** Paren-matched extraction of every `.select(...)` string literal. */
function extractSelectArguments(src: string): string[] {
  const out: string[] = [];
  const re = /\.select\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(src)) !== null) {
    void match;
    let depth = 1;
    let i = re.lastIndex;
    let buf = "";
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
        if (depth === 0) break;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        i++;
        while (i < src.length && src[i] !== quote) {
          if (src[i] === "\\") i++;
          buf += src[i];
          i++;
        }
      }
      i++;
    }
    out.push(buf);
  }
  return out;
}

const EXPECTED_SCALAR_COLUMNS = [
  "id",
  "created_at",
  "fixture_id",
  "home_team",
  "away_team",
  "league",
  "kickoff_utc",
  "model_version",
  "p_home",
  "p_draw",
  "p_away",
  "p_btts",
  "p_over_25",
  "top_scorelines",
  "sim_stats",
  "per_half_available",
  "market_anchor",
  "player_events",
  "status",
  "actual_home_goals",
  "actual_away_goals",
  "correct_winner",
  "correct_over_under",
  "actual_resolved_at",
];

/**
 * Captured state of one query path: every `.eq(col,val)` filter applied, the
 * select string, plus optional `.order(...)`/`.limit(...)` for the fallback.
 */
interface CapturedQuery {
  select?: string;
  eqs: Array<{ column: string; value: unknown }>;
  orders: Array<{ column: string; opts?: unknown }>;
  limit?: number;
}

/**
 * Two-path Supabase mock. The new `getFixtureSimulation` issues a PRIMARY
 * query (`.eq("fixture_id", apiId).maybeSingle()`) and, on miss/no-apiId, a
 * FALLBACK query (teams + `kickoff_utc::date`, ordered `created_at desc`,
 * `.limit(1)`). Each path resolves from its own configured row so a test can
 * prove which path served the result.
 *
 * `primaryRow`/`fallbackRow` undefined ⇒ that path returns no row. The mock
 * captures the filters of every path so the regression test can assert the
 * PARSED choistats id (not the route/table id) was used.
 */
function buildMock(opts: {
  primaryRow?: Record<string, unknown> | null;
  fallbackRow?: Record<string, unknown> | null;
  error?: { message: string } | null;
  fallbackError?: { message: string } | null;
  throwOnFrom?: boolean;
}) {
  const queries: CapturedQuery[] = [];

  function makeChain() {
    const cap: CapturedQuery = { eqs: [], orders: [] };
    queries.push(cap);
    const chain = {
      select(arg: string) {
        cap.select = arg;
        return this;
      },
      eq(column: string, value: unknown) {
        cap.eqs.push({ column, value });
        return this;
      },
      gte(column: string, value: unknown) {
        cap.eqs.push({ column: `${column}>=`, value });
        return this;
      },
      lt(column: string, value: unknown) {
        cap.eqs.push({ column: `${column}<`, value });
        return this;
      },
      order(column: string, o?: unknown) {
        cap.orders.push({ column, opts: o });
        return this;
      },
      limit(n: number) {
        cap.limit = n;
        return this;
      },
      maybeSingle() {
        // A query is the PRIMARY (id) path iff it filtered fixture_id.
        const isPrimary = cap.eqs.some((e) => e.column === "fixture_id");
        if (isPrimary) {
          return Promise.resolve(
            opts.error
              ? { data: null, error: opts.error }
              : { data: opts.primaryRow ?? null, error: null },
          );
        }
        return Promise.resolve(
          opts.fallbackError
            ? { data: null, error: opts.fallbackError }
            : { data: opts.fallbackRow ?? null, error: null },
        );
      },
    };
    return chain;
  }

  const client = {
    from(table: string) {
      if (opts.throwOnFrom) {
        throw new Error('relation "fixture_simulations" does not exist');
      }
      void table;
      return makeChain();
    },
  };
  return { client, queries };
}

const ROUTE_ID_FIXTURE = {
  // The `fixtures` table primary key — the OLD buggy lookup key. The choistats
  // id parsed from source_url is a DIFFERENT id space (the bug under test).
  sourceUrl: "https://www.adamchoi.co.uk/fixture/19427226/england-premier-league-chelsea-vs-tottenham",
  homeTeam: "Chelsea",
  awayTeam: "Tottenham",
  kickoffUtc: "2026-05-19T19:00:00Z",
};

function fullSimRow(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    created_at: "2026-05-18T10:00:00Z",
    fixture_id: 42,
    home_team: "Chelsea",
    away_team: "Tottenham",
    league: "Premier League",
    kickoff_utc: "2026-05-19T19:00:00Z",
    model_version: "dc-poisson-1",
    p_home: 0.52,
    p_draw: 0.26,
    p_away: 0.22,
    p_btts: 0.58,
    p_over_25: 0.61,
    top_scorelines: [
      { score: "1-0", prob: 0.14 },
      { score: "2-1", prob: 0.11 },
    ],
    sim_stats: {
      home: { corners: { p50: 6 }, goals: { p50: 1.6 } },
      away: { corners: { p50: 4 }, goals: { p50: 1.1 } },
    },
    per_half_available: true,
    market_anchor: { p_home: 0.5, p_draw: 0.27, p_away: 0.23 },
    player_events: [
      {
        name: "Cole Palmer",
        p_goal: 0.41,
        expected_goals: 0.58,
        p_card: 0.14,
        p_sot: 0.62,
        provavel_titular: true,
        confidence: "alto",
      },
    ],
    status: "simulated",
    actual_home_goals: null,
    actual_away_goals: null,
    correct_winner: null,
    correct_over_under: null,
    actual_resolved_at: null,
    ...over,
  };
}

describe("simulation-repository — static payload guard (no detail_json)", () => {
  const selects = extractSelectArguments(SOURCE);

  it("has at least one .select(...) to scan", () => {
    expect(selects.length).toBeGreaterThan(0);
  });

  it("no .select() references detail_json at all (bare or path)", () => {
    for (const sel of selects) {
      expect(
        sel,
        `forbidden detail_json reference in select: "${sel}"`,
      ).not.toContain("detail_json");
    }
  });

  it("the select lists ONLY the agreed scalar/jsonb-result columns", () => {
    // Empty matches come from `.select(...)` mentioned in doc comments; the
    // real queries are the non-empty literals (primary + teams/kickoff
    // fallback — both share the identical scalar column list).
    const real = selects.filter((s) => s.trim().length > 0);
    expect(real.length).toBeGreaterThanOrEqual(1);
    for (const sel of real) {
      const cols = sel
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      for (const col of cols) {
        expect(
          EXPECTED_SCALAR_COLUMNS,
          `unexpected column "${col}" selected`,
        ).toContain(col);
      }
      // and every expected scalar must be present
      for (const want of EXPECTED_SCALAR_COLUMNS) {
        expect(cols, `missing column "${want}"`).toContain(want);
      }
    }
  });
});

describe("getFixtureSimulation — id-space mismatch regression", () => {
  /**
   * THE BUG: the page passed `row.id` (the `fixtures` PK, e.g. 716) while the
   * Ruby hook stores `fixture_simulations.fixture_id` = the choistats id
   * parsed from `source_url` (e.g. 19427226). These are different id spaces →
   * 0 rows ever matched → "simulação indisponível" for every fixture.
   *
   * This test gives the new API the fixture identity. The sim row only exists
   * under `fixture_id = 19427226` (the PARSED choistats id). The primary query
   * MUST filter `fixture_id` by 19427226 (parsed from source_url), NOT by any
   * route/table id, and MUST return that row.
   */
  it("matches by the choistats id parsed from source_url (not the route id)", async () => {
    const { client, queries } = buildMock({
      primaryRow: fullSimRow({ fixture_id: 19427226 }),
    });

    const dto = await getFixtureSimulation(ROUTE_ID_FIXTURE, client);

    expect(dto, "the sim row must be found via the parsed id").not.toBeNull();
    expect(dto!.fixture_id).toBe(19427226);

    const primary = queries[0];
    const fidEq = primary.eqs.find((e) => e.column === "fixture_id");
    expect(fidEq, "primary query must filter by fixture_id").toBeDefined();
    // The PARSED choistats id — same regex semantics as Ruby `fixture_api_id`.
    expect(fidEq!.value).toBe(19427226);
  });

  it("uses the SAME regex semantics as the Ruby fixture_api_id", async () => {
    // Ruby: /fixture/(\d+) matched anywhere in source_url; slug after the id
    // is ignored. A trailing slug must not corrupt the parsed id.
    const { client, queries } = buildMock({
      primaryRow: fullSimRow({ fixture_id: 99 }),
    });
    await getFixtureSimulation(
      {
        sourceUrl: "/fixture/99/spain-la-liga-real-vs-barca",
        homeTeam: "Real",
        awayTeam: "Barca",
        kickoffUtc: null,
      },
      client,
    );
    const fidEq = queries[0].eqs.find((e) => e.column === "fixture_id");
    expect(fidEq!.value).toBe(99);
  });

  it("scalar select only — never references detail_json on the wire", async () => {
    const { client, queries } = buildMock({
      primaryRow: fullSimRow({ fixture_id: 19427226 }),
    });
    await getFixtureSimulation(ROUTE_ID_FIXTURE, client);
    expect(queries[0].select).toBeDefined();
    expect(queries[0].select).not.toContain("detail_json");
  });
});

describe("getFixtureSimulation — teams/kickoff fallback", () => {
  it("falls back to teams + kickoff day when source_url has no numeric id", async () => {
    const { client, queries } = buildMock({
      fallbackRow: fullSimRow({ fixture_id: null }),
    });

    const dto = await getFixtureSimulation(
      {
        sourceUrl: null,
        homeTeam: "Chelsea",
        awayTeam: "Tottenham",
        kickoffUtc: "2026-05-19T19:00:00Z",
      },
      client,
    );

    expect(dto, "fallback must resolve the row").not.toBeNull();
    expect(dto!.home_team).toBe("Chelsea");

    // No apiId ⇒ exactly one query path, and it filters by teams.
    expect(queries.length).toBe(1);
    const fb = queries[0];
    expect(fb.eqs.some((e) => e.column === "home_team" && e.value === "Chelsea")).toBe(true);
    expect(fb.eqs.some((e) => e.column === "away_team" && e.value === "Tottenham")).toBe(true);
    // Must constrain by kickoff (same teams can recur within retention) and
    // be deterministic (newest created_at first, limit 1).
    expect(fb.orders.some((o) => o.column === "created_at")).toBe(true);
    expect(fb.limit).toBe(1);
    // No detail_json on the fallback path either.
    expect(fb.select).not.toContain("detail_json");
  });

  it("falls back to teams/kickoff when the PRIMARY id query misses", async () => {
    // apiId present but no fixture_simulations row under it → fallback by
    // teams/kickoff must still resolve (e.g. id-space drift on old rows).
    const { client, queries } = buildMock({
      primaryRow: null,
      fallbackRow: fullSimRow({ fixture_id: null }),
    });

    const dto = await getFixtureSimulation(ROUTE_ID_FIXTURE, client);

    expect(dto, "fallback must rescue a primary miss").not.toBeNull();
    expect(queries.length).toBe(2); // primary (miss) + fallback (hit)
    expect(queries[0].eqs.some((e) => e.column === "fixture_id")).toBe(true);
    expect(
      queries[1].eqs.some((e) => e.column === "home_team"),
    ).toBe(true);
  });

  it("prefers the PRIMARY id hit and does NOT issue the fallback", async () => {
    const { client, queries } = buildMock({
      primaryRow: fullSimRow({ fixture_id: 19427226 }),
      fallbackRow: fullSimRow({ fixture_id: null, id: 999 }),
    });
    const dto = await getFixtureSimulation(ROUTE_ID_FIXTURE, client);
    expect(dto!.fixture_id).toBe(19427226);
    expect(queries.length).toBe(1); // fallback never ran
  });
});

describe("getFixtureSimulation — DTO mapping + graceful degradation", () => {
  it("maps the row into a typed DTO", async () => {
    const { client } = buildMock({
      primaryRow: fullSimRow({ fixture_id: 19427226 }),
    });
    const dto = await getFixtureSimulation(ROUTE_ID_FIXTURE, client);

    expect(dto).not.toBeNull();
    expect(dto!.fixture_id).toBe(19427226);
    expect(dto!.p_home).toBeCloseTo(0.52);
    expect(dto!.p_draw).toBeCloseTo(0.26);
    expect(dto!.p_away).toBeCloseTo(0.22);
    expect(dto!.p_btts).toBeCloseTo(0.58);
    expect(dto!.p_over_25).toBeCloseTo(0.61);
    expect(dto!.per_half_available).toBe(true);
    expect(dto!.top_scorelines[0]).toEqual({ score: "1-0", prob: 0.14 });
    expect(dto!.player_events[0].name).toBe("Cole Palmer");
    expect(dto!.player_events[0].provavel_titular).toBe(true);
    expect(dto!.status).toBe("simulated");
  });

  it("returns null when no row exists on either path (graceful)", async () => {
    const { client } = buildMock({ primaryRow: null, fallbackRow: null });
    expect(await getFixtureSimulation(ROUTE_ID_FIXTURE, client)).toBeNull();
  });

  it("degrades to null on query error (never throws)", async () => {
    const { client } = buildMock({
      error: { message: "relation does not exist" },
      fallbackError: { message: "relation does not exist" },
    });
    expect(await getFixtureSimulation(ROUTE_ID_FIXTURE, client)).toBeNull();
  });

  it("degrades to null when the table/relation is absent (from throws)", async () => {
    const { client } = buildMock({ throwOnFrom: true });
    expect(await getFixtureSimulation(ROUTE_ID_FIXTURE, client)).toBeNull();
  });

  it("normalizes missing jsonb fields to safe empties", async () => {
    const { client } = buildMock({
      primaryRow: fullSimRow({
        fixture_id: 19427226,
        top_scorelines: null,
        sim_stats: null,
        player_events: null,
        market_anchor: null,
      }),
    });
    const dto = await getFixtureSimulation(ROUTE_ID_FIXTURE, client);
    expect(dto!.top_scorelines).toEqual([]);
    expect(dto!.player_events).toEqual([]);
    expect(dto!.sim_stats).toBeNull();
    expect(dto!.market_anchor).toBeNull();
  });

  it("maps status 'unsimulable' through unchanged", async () => {
    const { client } = buildMock({
      primaryRow: fullSimRow({ fixture_id: 19427226, status: "unsimulable" }),
    });
    const dto = await getFixtureSimulation(ROUTE_ID_FIXTURE, client);
    expect(dto!.status).toBe("unsimulable");
  });
});
