import { describe, it, expect } from "vitest";

import {
  computeCorrelations,
  computeTrends,
  computePatterns,
  computeOutliers,
  rankInsights,
} from "./insights";
import type { Insight } from "./insights";
import type {
  NormalizedRecentMatch,
  RefereeRecord,
  Streaks,
} from "./detail-json-types";

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Builds a fully-populated NormalizedRecentMatch with overridable fields.
 * Keeps tests focused on the variable under study without 30-line literals.
 */
function makeMatch(
  overrides: Partial<NormalizedRecentMatch> = {},
): NormalizedRecentMatch {
  return {
    id: 0,
    date_iso: "2026-01-01",
    opponent: "X",
    is_home: true,
    result: null,
    goals_1h_for: 0,
    goals_2h_for: 0,
    goals_1h_against: 0,
    goals_2h_against: 0,
    goals_ft_for: 0,
    goals_ft_against: 0,
    corners_1h_for: 0,
    corners_2h_for: 0,
    corners_1h_against: 0,
    corners_2h_against: 0,
    corners_for: 0,
    corners_against: 0,
    cards_1h_for: 0,
    cards_2h_for: 0,
    cards_1h_against: 0,
    cards_2h_against: 0,
    cards_for: 0,
    cards_against: 0,
    sot_for: 0,
    sot_against: 0,
    shots_for: 0,
    shots_against: 0,
    booking_points_for: 0,
    booking_points_against: 0,
    fouls_for: 0,
    fouls_against: 0,
    offsides_for: 0,
    offsides_against: 0,
    ...overrides,
  };
}

function buildSeries(
  pairs: Array<[number, number]>,
  keyX: keyof NormalizedRecentMatch,
  keyY: keyof NormalizedRecentMatch,
): NormalizedRecentMatch[] {
  return pairs.map(([x, y], i) =>
    makeMatch({
      id: i,
      date_iso: `2026-01-${String(i + 1).padStart(2, "0")}`,
      [keyX]: x,
      [keyY]: y,
    } as Partial<NormalizedRecentMatch>),
  );
}

// ─── computeCorrelations ─────────────────────────────────────────────────

describe("computeCorrelations", () => {
  it("returns [] for 0 matches", () => {
    expect(computeCorrelations([])).toEqual([]);
  });

  it("returns [] for fewer than 3 matches (correlation undefined)", () => {
    const matches = [makeMatch({ sot_for: 1, goals_ft_for: 0 })];
    expect(computeCorrelations(matches)).toEqual([]);
  });

  it("flags perfect r=1 correlation (SOT × goals_ft_for)", () => {
    // y = x, perfect positive correlation
    const matches = buildSeries(
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      "sot_for",
      "goals_ft_for",
    );
    const out = computeCorrelations(matches);
    // Pair order between statA/statB is implementation-defined — check by set.
    const sotGoals = out.find((i) => {
      const pair = new Set([i.statA, i.statB]);
      return pair.has("sot_for") && pair.has("goals_ft_for");
    });
    expect(sotGoals).toBeDefined();
    expect(sotGoals!.r).toBeCloseTo(1, 5);
    expect(sotGoals!.kind).toBe("correlation");
    expect(sotGoals!.confidence).toBeGreaterThan(0.9);
  });

  it("flags strong negative correlation r close to -1", () => {
    const matches = buildSeries(
      [
        [1, 5],
        [2, 4],
        [3, 3],
        [4, 2],
        [5, 1],
      ],
      "sot_for",
      "goals_ft_against",
    );
    const out = computeCorrelations(matches);
    const found = out.find((i) => {
      const pair = new Set([i.statA, i.statB]);
      return pair.has("sot_for") && pair.has("goals_ft_against");
    });
    expect(found).toBeDefined();
    expect(found!.r).toBeCloseTo(-1, 5);
  });

  it("does not flag weak correlation (|r| < 0.5)", () => {
    // mostly noise, low correlation
    const matches = buildSeries(
      [
        [1, 5],
        [2, 1],
        [3, 4],
        [4, 2],
        [5, 3],
      ],
      "sot_for",
      "fouls_for",
    );
    const out = computeCorrelations(matches);
    const found = out.find(
      (i) =>
        (i.statA === "sot_for" && i.statB === "fouls_for") ||
        (i.statA === "fouls_for" && i.statB === "sot_for"),
    );
    expect(found).toBeUndefined();
  });

  it("dedupes pairs — (A,B) and (B,A) appear at most once", () => {
    const matches = buildSeries(
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      "sot_for",
      "goals_ft_for",
    );
    const out = computeCorrelations(matches);
    const pairs = out.map((i) => [i.statA, i.statB].sort().join("|"));
    const uniq = new Set(pairs);
    expect(pairs.length).toBe(uniq.size);
  });

  it("limits output to top 10", () => {
    // Construct matches where many pairs are perfectly correlated.
    // Build identical values across multiple keys so every pair has r=1.
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 1; i <= 6; i++) {
      matches.push(
        makeMatch({
          id: i,
          goals_ft_for: i,
          goals_ft_against: i,
          corners_for: i,
          corners_against: i,
          cards_for: i,
          sot_for: i,
          shots_for: i,
          booking_points_for: i,
          fouls_for: i,
          offsides_for: i,
        }),
      );
    }
    const out = computeCorrelations(matches);
    expect(out.length).toBeLessThanOrEqual(10);
  });

  it("each insight has kind, headline, text, confidence", () => {
    const matches = buildSeries(
      [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      "sot_for",
      "goals_ft_for",
    );
    const out = computeCorrelations(matches);
    expect(out.length).toBeGreaterThan(0);
    for (const ins of out) {
      expect(ins.kind).toBe("correlation");
      expect(typeof ins.headline).toBe("string");
      expect(ins.headline.length).toBeGreaterThan(0);
      expect(typeof ins.text).toBe("string");
      expect(typeof ins.confidence).toBe("number");
      expect(ins.confidence).toBeGreaterThanOrEqual(0);
      expect(ins.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("ignores series with null values (skips pair gracefully)", () => {
    const matches = [
      makeMatch({ sot_for: null, goals_ft_for: 1 }),
      makeMatch({ sot_for: null, goals_ft_for: 2 }),
      makeMatch({ sot_for: null, goals_ft_for: 3 }),
      makeMatch({ sot_for: null, goals_ft_for: 4 }),
    ];
    // No throw; pair containing only nulls is silently skipped.
    expect(() => computeCorrelations(matches)).not.toThrow();
  });
});

// ─── computeTrends ───────────────────────────────────────────────────────

describe("computeTrends", () => {
  it("returns [] for 0 matches", () => {
    expect(computeTrends([])).toEqual([]);
  });

  it("returns [] for fewer than 4 matches (regression unstable)", () => {
    const matches = [
      makeMatch({ goals_ft_for: 0 }),
      makeMatch({ goals_ft_for: 1 }),
      makeMatch({ goals_ft_for: 2 }),
    ];
    expect(computeTrends(matches)).toEqual([]);
  });

  it("flags positive slope ≥ 0.3 (goals/match increasing)", () => {
    // y = 0 + 0.5x → slope 0.5
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(makeMatch({ id: i, goals_ft_for: i * 0.5 }));
    }
    const out = computeTrends(matches);
    const goals = out.find((i) => i.stat === "goals_ft_for");
    expect(goals).toBeDefined();
    expect(goals!.kind).toBe("trend");
    expect(goals!.slope).toBeGreaterThanOrEqual(0.3);
    expect(goals!.direction).toBe("up");
  });

  it("flags negative slope ≤ -0.3", () => {
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(makeMatch({ id: i, goals_ft_for: 5 - i * 0.5 }));
    }
    const out = computeTrends(matches);
    const goals = out.find((i) => i.stat === "goals_ft_for");
    expect(goals).toBeDefined();
    expect(goals!.slope).toBeLessThanOrEqual(-0.3);
    expect(goals!.direction).toBe("down");
  });

  it("does NOT flag flat data (slope ~ 0)", () => {
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(makeMatch({ id: i, goals_ft_for: 2 }));
    }
    const out = computeTrends(matches);
    const goals = out.find((i) => i.stat === "goals_ft_for");
    expect(goals).toBeUndefined();
  });

  it("does NOT flag small slope < 0.3 in magnitude", () => {
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 6; i++) {
      // slope = 0.1, below threshold
      matches.push(makeMatch({ id: i, goals_ft_for: i * 0.1 }));
    }
    const out = computeTrends(matches);
    const goals = out.find((i) => i.stat === "goals_ft_for");
    expect(goals).toBeUndefined();
  });

  it("each trend insight has kind=trend, headline, text, confidence, stat, slope, direction", () => {
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(makeMatch({ id: i, sot_for: i }));
    }
    const out = computeTrends(matches);
    expect(out.length).toBeGreaterThan(0);
    for (const ins of out) {
      expect(ins.kind).toBe("trend");
      expect(typeof ins.headline).toBe("string");
      expect(typeof ins.text).toBe("string");
      expect(typeof ins.confidence).toBe("number");
      expect(typeof ins.stat).toBe("string");
      expect(typeof ins.slope).toBe("number");
      expect(["up", "down"]).toContain(ins.direction);
    }
  });
});

// ─── computePatterns ─────────────────────────────────────────────────────

const EMPTY_STREAKS: Streaks = { home: [], away: [] };

function refRecord(avg_total_booking_points: number): RefereeRecord {
  return {
    name: "Ref",
    completed: 20,
    fixtures_count: 20,
    avg_total_booking_points,
    avg_home_booking_points: avg_total_booking_points / 2,
    avg_away_booking_points: avg_total_booking_points / 2,
    total_yellow_reds: 0,
  };
}

describe("computePatterns", () => {
  it("returns [] when streaks are empty", () => {
    expect(
      computePatterns({ streaks: EMPTY_STREAKS, referee: null, matches: [] }),
    ).toEqual([]);
  });

  it("flags BTTS streak ≥ 70% + ref BP > 45 → high-BP pattern", () => {
    const streaks: Streaks = {
      home: [
        {
          desc: "BTTS Yes in 8/10",
          group: "BTTS",
          stat_type: "btts_yes",
          line: 0,
          colour: "positive",
          overall_count: 8,
          overall_fixtures: 10,
          overall_perc: 80,
          overall_streak: 4,
          home_count: 4,
          home_fixtures: 5,
          home_perc: 80,
          home_streak: 2,
          away_count: 4,
          away_fixtures: 5,
          away_perc: 80,
          away_streak: 2,
        },
      ],
      away: [],
    };
    const out = computePatterns({
      streaks,
      referee: refRecord(60),
      matches: [],
    });
    const btts = out.find((p) => p.code === "btts_high_bp");
    expect(btts).toBeDefined();
    expect(btts!.kind).toBe("pattern");
    expect(btts!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("skips patterns that need referee when referee_record is null", () => {
    const streaks: Streaks = {
      home: [
        {
          desc: "BTTS Yes in 8/10",
          group: "BTTS",
          stat_type: "btts_yes",
          line: 0,
          colour: "positive",
          overall_count: 8,
          overall_fixtures: 10,
          overall_perc: 80,
          overall_streak: 4,
          home_count: 0,
          home_fixtures: 0,
          home_perc: 0,
          home_streak: 0,
          away_count: 0,
          away_fixtures: 0,
          away_perc: 0,
          away_streak: 0,
        },
      ],
      away: [],
    };
    const out = computePatterns({
      streaks,
      referee: null,
      matches: [],
    });
    const btts = out.find((p) => p.code === "btts_high_bp");
    expect(btts).toBeUndefined();
  });

  it("flags cards_1h average ≥ 0.5 + ref BP high → cards pattern", () => {
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 5; i++) {
      matches.push(makeMatch({ id: i, cards_1h_for: 1 }));
    }
    const out = computePatterns({
      streaks: EMPTY_STREAKS,
      referee: refRecord(55),
      matches,
    });
    const cards = out.find((p) => p.code === "cards_1h_high_ref");
    expect(cards).toBeDefined();
    expect(cards!.kind).toBe("pattern");
  });

  it("does NOT flag cards pattern when ref BP is low", () => {
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 5; i++) {
      matches.push(makeMatch({ id: i, cards_1h_for: 1 }));
    }
    const out = computePatterns({
      streaks: EMPTY_STREAKS,
      referee: refRecord(30),
      matches,
    });
    const cards = out.find((p) => p.code === "cards_1h_high_ref");
    expect(cards).toBeUndefined();
  });

  it("does NOT flag BTTS pattern when streak perc < 70", () => {
    const streaks: Streaks = {
      home: [
        {
          desc: "BTTS Yes in 6/10",
          group: "BTTS",
          stat_type: "btts_yes",
          line: 0,
          colour: "positive",
          overall_count: 6,
          overall_fixtures: 10,
          overall_perc: 60,
          overall_streak: 1,
          home_count: 0,
          home_fixtures: 0,
          home_perc: 0,
          home_streak: 0,
          away_count: 0,
          away_fixtures: 0,
          away_perc: 0,
          away_streak: 0,
        },
      ],
      away: [],
    };
    const out = computePatterns({
      streaks,
      referee: refRecord(60),
      matches: [],
    });
    const btts = out.find((p) => p.code === "btts_high_bp");
    expect(btts).toBeUndefined();
  });

  it("each pattern insight has required fields", () => {
    const streaks: Streaks = {
      home: [
        {
          desc: "BTTS Yes in 9/10",
          group: "BTTS",
          stat_type: "btts_yes",
          line: 0,
          colour: "positive",
          overall_count: 9,
          overall_fixtures: 10,
          overall_perc: 90,
          overall_streak: 7,
          home_count: 4,
          home_fixtures: 5,
          home_perc: 80,
          home_streak: 3,
          away_count: 5,
          away_fixtures: 5,
          away_perc: 100,
          away_streak: 4,
        },
      ],
      away: [],
    };
    const out = computePatterns({
      streaks,
      referee: refRecord(60),
      matches: [],
    });
    for (const ins of out) {
      expect(ins.kind).toBe("pattern");
      expect(typeof ins.code).toBe("string");
      expect(typeof ins.headline).toBe("string");
      expect(typeof ins.text).toBe("string");
      expect(typeof ins.confidence).toBe("number");
    }
  });
});

// ─── computeOutliers ─────────────────────────────────────────────────────

describe("computeOutliers", () => {
  it("returns [] for 0 matches", () => {
    expect(computeOutliers([])).toEqual([]);
  });

  it("returns [] when all values within 1σ", () => {
    // mostly tight cluster
    const matches = [
      makeMatch({ id: 1, goals_ft_for: 1 }),
      makeMatch({ id: 2, goals_ft_for: 2 }),
      makeMatch({ id: 3, goals_ft_for: 1 }),
      makeMatch({ id: 4, goals_ft_for: 2 }),
      makeMatch({ id: 5, goals_ft_for: 1 }),
    ];
    const out = computeOutliers(matches);
    expect(out.length).toBe(0);
  });

  it("flags a match with goals_ft=8 in a series averaging ~1.5", () => {
    const matches = [
      makeMatch({ id: 1, goals_ft_for: 1 }),
      makeMatch({ id: 2, goals_ft_for: 2 }),
      makeMatch({ id: 3, goals_ft_for: 1 }),
      makeMatch({ id: 4, goals_ft_for: 2 }),
      makeMatch({ id: 5, goals_ft_for: 1 }),
      makeMatch({ id: 6, goals_ft_for: 2 }),
      makeMatch({ id: 7, goals_ft_for: 8 }),
    ];
    const out = computeOutliers(matches);
    const found = out.find(
      (o) => o.stat === "goals_ft_for" && o.matchId === 7,
    );
    expect(found).toBeDefined();
    expect(found!.kind).toBe("outlier");
    expect(found!.zScore).toBeGreaterThanOrEqual(2);
  });

  it("each outlier insight has kind, headline, text, confidence, stat, matchId, value, zScore", () => {
    const matches = [
      makeMatch({ id: 1, corners_for: 4 }),
      makeMatch({ id: 2, corners_for: 5 }),
      makeMatch({ id: 3, corners_for: 4 }),
      makeMatch({ id: 4, corners_for: 5 }),
      makeMatch({ id: 5, corners_for: 4 }),
      makeMatch({ id: 6, corners_for: 5 }),
      makeMatch({ id: 7, corners_for: 25 }),
    ];
    const out = computeOutliers(matches);
    expect(out.length).toBeGreaterThan(0);
    for (const ins of out) {
      expect(ins.kind).toBe("outlier");
      expect(typeof ins.headline).toBe("string");
      expect(typeof ins.text).toBe("string");
      expect(typeof ins.confidence).toBe("number");
      expect(typeof ins.stat).toBe("string");
      expect(typeof ins.matchId).toBe("number");
      expect(typeof ins.value).toBe("number");
      expect(typeof ins.zScore).toBe("number");
    }
  });

  it("ignores series with zero variance", () => {
    const matches: NormalizedRecentMatch[] = [];
    for (let i = 0; i < 6; i++) {
      matches.push(makeMatch({ id: i, goals_ft_for: 2 }));
    }
    const out = computeOutliers(matches);
    expect(out.length).toBe(0);
  });
});

// ─── rankInsights ────────────────────────────────────────────────────────

describe("rankInsights", () => {
  it("returns [] for empty input", () => {
    expect(rankInsights([])).toEqual([]);
  });

  it("respects default topN=6", () => {
    const insights: Insight[] = Array.from({ length: 10 }, (_, i) => ({
      kind: "correlation",
      statA: "sot_for",
      statB: "goals_ft_for",
      r: 0.9 - i * 0.01,
      headline: `Headline ${i}`,
      text: "details",
      confidence: 0.9 - i * 0.01,
    }));
    const out = rankInsights(insights);
    expect(out.length).toBe(6);
  });

  it("sorts by confidence DESC", () => {
    const a: Insight = {
      kind: "trend",
      stat: "goals_ft_for",
      slope: 0.4,
      direction: "up",
      headline: "low",
      text: "",
      confidence: 0.5,
    };
    const b: Insight = {
      kind: "outlier",
      stat: "goals_ft_for",
      matchId: 1,
      value: 8,
      zScore: 3,
      headline: "high",
      text: "",
      confidence: 0.95,
    };
    const c: Insight = {
      kind: "pattern",
      code: "btts_high_bp",
      headline: "mid",
      text: "",
      confidence: 0.7,
    };
    const out = rankInsights([a, b, c]);
    expect(out.map((i) => i.confidence)).toEqual([0.95, 0.7, 0.5]);
  });

  it("dedupes by kind+headline (first occurrence wins)", () => {
    const a: Insight = {
      kind: "correlation",
      statA: "sot_for",
      statB: "goals_ft_for",
      r: 0.9,
      headline: "Same headline",
      text: "first",
      confidence: 0.9,
    };
    const b: Insight = {
      kind: "correlation",
      statA: "sot_for",
      statB: "goals_ft_for",
      r: 0.85,
      headline: "Same headline",
      text: "dup",
      confidence: 0.85,
    };
    const out = rankInsights([a, b]);
    expect(out.length).toBe(1);
    expect(out[0].text).toBe("first");
  });

  it("does NOT dedupe across different kinds even when headline matches", () => {
    const a: Insight = {
      kind: "correlation",
      statA: "sot_for",
      statB: "goals_ft_for",
      r: 0.9,
      headline: "Same",
      text: "",
      confidence: 0.9,
    };
    const b: Insight = {
      kind: "trend",
      stat: "goals_ft_for",
      slope: 0.4,
      direction: "up",
      headline: "Same",
      text: "",
      confidence: 0.8,
    };
    const out = rankInsights([a, b]);
    expect(out.length).toBe(2);
  });

  it("respects custom topN", () => {
    const insights: Insight[] = Array.from({ length: 5 }, (_, i) => ({
      kind: "trend",
      stat: "goals_ft_for",
      slope: 0.4,
      direction: "up",
      headline: `T${i}`,
      text: "",
      confidence: 0.9 - i * 0.05,
    }));
    expect(rankInsights(insights, 2).length).toBe(2);
    expect(rankInsights(insights, 100).length).toBe(5);
  });
});
