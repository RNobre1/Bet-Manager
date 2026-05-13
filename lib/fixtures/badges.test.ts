import { describe, it, expect } from "vitest";
import { computeBadges } from "./badges";

function withStreaks(overrides: {
  home?: unknown[];
  away?: unknown[];
}): unknown {
  return {
    streaks: {
      home: overrides.home ?? [],
      away: overrides.away ?? [],
    },
  };
}

describe("computeBadges — cartões", () => {
  it("emits cartao-alto when referee average booking points > 45", () => {
    const out = computeBadges({
      referee_record: {
        name: "Adrián Cordero Vega",
        completed: 21,
        avg_total_booking_points: 47.2,
      },
    });
    expect(out.map((b) => b.id)).toContain("cartao-alto");
  });

  it("emits cartao-alto when referee has >= 3 second-yellows", () => {
    const out = computeBadges({
      referee_record: {
        name: "X",
        completed: 10,
        avg_total_booking_points: 30,
        total_yellow_reds: 4,
      },
    });
    expect(out.map((b) => b.id)).toContain("cartao-alto");
  });

  it("skips cartao-alto when referee has 0 completed jogos (insufficient sample)", () => {
    const out = computeBadges({
      referee_record: {
        name: "Newbie",
        completed: 0,
        avg_total_booking_points: 99,
      },
    });
    expect(out.map((b) => b.id)).not.toContain("cartao-alto");
  });

  it("skips when referee data missing", () => {
    const out = computeBadges({});
    expect(out.map((b) => b.id)).not.toContain("cartao-alto");
  });
});

describe("computeBadges — over 2.5", () => {
  it("emits over-alto when both sides have an Over 2.5 streak >= 70%", () => {
    const out = computeBadges(
      withStreaks({
        home: [{ stat_type: "Over 2.5 Goals", overall_perc: 78 }],
        away: [{ stat_type: "Over 2.5 Goals", overall_perc: 71 }],
      }),
    );
    expect(out.map((b) => b.id)).toContain("over-alto");
  });

  it("matches via desc when stat_type is missing", () => {
    const out = computeBadges(
      withStreaks({
        home: [{ desc: "Over 2.5 goals scored in", overall_perc: 80 }],
        away: [{ desc: "Over 2.5 in last 10 matches", overall_perc: 75 }],
      }),
    );
    expect(out.map((b) => b.id)).toContain("over-alto");
  });

  it("does NOT emit when only one side has the streak", () => {
    const out = computeBadges(
      withStreaks({
        home: [{ stat_type: "Over 2.5 Goals", overall_perc: 90 }],
        away: [{ stat_type: "Over 2.5 Goals", overall_perc: 55 }],
      }),
    );
    expect(out.map((b) => b.id)).not.toContain("over-alto");
  });

  it("does NOT match Over 1.5 (different market)", () => {
    const out = computeBadges(
      withStreaks({
        home: [{ stat_type: "Over 1.5 Goals", overall_perc: 95 }],
        away: [{ stat_type: "Over 1.5 Goals", overall_perc: 95 }],
      }),
    );
    expect(out.map((b) => b.id)).not.toContain("over-alto");
  });
});

describe("computeBadges — BTTS", () => {
  it("emits btts-alto when both sides have a BTTS streak >= 70%", () => {
    const out = computeBadges(
      withStreaks({
        home: [{ stat_type: "BTTS — Yes", overall_perc: 75 }],
        away: [{ desc: "Both Teams To Score Yes", overall_perc: 72 }],
      }),
    );
    expect(out.map((b) => b.id)).toContain("btts-alto");
  });

  it("does NOT emit when only one side qualifies", () => {
    const out = computeBadges(
      withStreaks({
        home: [{ stat_type: "BTTS", overall_perc: 80 }],
        away: [{ stat_type: "BTTS", overall_perc: 60 }],
      }),
    );
    expect(out.map((b) => b.id)).not.toContain("btts-alto");
  });
});

describe("computeBadges — 1º tempo", () => {
  it("emits primeiro-tempo when both sides have a 1H goals streak >= 70%", () => {
    const out = computeBadges(
      withStreaks({
        home: [{ stat_type: "1H Over 0.5 Goals", overall_perc: 80 }],
        away: [{ desc: "First Half Goal scored", overall_perc: 72 }],
      }),
    );
    expect(out.map((b) => b.id)).toContain("primeiro-tempo");
  });
});

describe("computeBadges — robustness", () => {
  it("returns [] when detail_json is null", () => {
    expect(computeBadges(null)).toEqual([]);
  });

  it("returns [] when detail_json is missing both streaks and referee", () => {
    expect(computeBadges({ recent_matches: { home: [], away: [] } })).toEqual(
      [],
    );
  });

  it("caps output at 3 badges to avoid card clutter", () => {
    const out = computeBadges({
      referee_record: {
        name: "X",
        completed: 10,
        avg_total_booking_points: 60,
        total_yellow_reds: 5,
      },
      streaks: {
        home: [
          { stat_type: "Over 2.5 Goals", overall_perc: 80 },
          { stat_type: "BTTS", overall_perc: 80 },
          { stat_type: "1H Over 0.5 Goals", overall_perc: 80 },
        ],
        away: [
          { stat_type: "Over 2.5 Goals", overall_perc: 80 },
          { stat_type: "BTTS", overall_perc: 80 },
          { stat_type: "1H Over 0.5 Goals", overall_perc: 80 },
        ],
      },
    });
    expect(out.length).toBeLessThanOrEqual(3);
  });

  it("each badge has id, label, tone", () => {
    const out = computeBadges({
      referee_record: {
        name: "X",
        completed: 10,
        avg_total_booking_points: 50,
      },
    });
    expect(out[0]).toMatchObject({
      id: expect.any(String),
      label: expect.any(String),
      tone: expect.any(String),
    });
  });
});
