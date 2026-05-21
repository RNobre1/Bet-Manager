import { describe, it, expect } from "vitest";
import {
  reliabilityBins,
  brierOverTime,
  marketDeviation,
  type ResolvedSimRow,
} from "@/lib/calibracao/sim-reliability";

function row(over: Partial<ResolvedSimRow> = {}): ResolvedSimRow {
  return {
    league: "Premier League",
    p_home: 0.5,
    p_draw: 0.25,
    p_away: 0.25,
    p_over_25: 0.5,
    market_anchor: null,
    actual_home_goals: 1,
    actual_away_goals: 1,
    actual_resolved_at: "2026-05-15T12:00:00Z",
    ...over,
  };
}

describe("reliabilityBins", () => {
  it("agrupa por bin de 10pp e calcula frequência observada vs prevista (home)", () => {
    const rows: ResolvedSimRow[] = [
      row({ p_home: 0.51, actual_home_goals: 2, actual_away_goals: 0 }),
      row({ p_home: 0.55, actual_home_goals: 1, actual_away_goals: 0 }),
      row({ p_home: 0.59, actual_home_goals: 0, actual_away_goals: 2 }),
      row({ p_home: 0.71, actual_home_goals: 3, actual_away_goals: 0 }),
      row({ p_home: 0.79, actual_home_goals: 1, actual_away_goals: 0 }),
    ];
    const bins = reliabilityBins(rows, "1x2-home");
    const b50 = bins.find((b) => b.range[0] === 0.5);
    expect(b50?.n).toBe(3);
    expect(b50?.predictedAvg).toBeCloseTo(0.55, 2);
    expect(b50?.observedFreq).toBeCloseTo(2 / 3, 2);

    const b70 = bins.find((b) => b.range[0] === 0.7);
    expect(b70?.n).toBe(2);
    expect(b70?.observedFreq).toBe(1.0);
  });

  it("para over 2.5: trata gols totais > 2.5 como 'sucesso'", () => {
    const rows: ResolvedSimRow[] = [
      row({ p_over_25: 0.65, actual_home_goals: 2, actual_away_goals: 1 }),
      row({ p_over_25: 0.62, actual_home_goals: 1, actual_away_goals: 1 }),
      row({ p_over_25: 0.68, actual_home_goals: 4, actual_away_goals: 0 }),
    ];
    const bins = reliabilityBins(rows, "over25");
    const b60 = bins.find((b) => b.range[0] === 0.6);
    expect(b60?.n).toBe(3);
    expect(b60?.observedFreq).toBeCloseTo(2 / 3, 2);
  });

  it("dataset vazio devolve 10 bins com n=0", () => {
    const bins = reliabilityBins([], "1x2-home");
    expect(bins.length).toBe(10);
    expect(bins.every((b) => b.n === 0)).toBe(true);
    expect(bins.every((b) => b.predictedAvg === null && b.observedFreq === null)).toBe(true);
  });

  it("ignora rows com p_home/p_over_25 inválido (null/NaN)", () => {
    const rows: ResolvedSimRow[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row({ p_home: null as any }),
      row({ p_home: Number.NaN }),
      row({ p_home: 0.6, actual_home_goals: 2, actual_away_goals: 0 }),
    ];
    const bins = reliabilityBins(rows, "1x2-home");
    expect(bins.reduce((s, b) => s + b.n, 0)).toBe(1);
  });
});

describe("brierOverTime", () => {
  it("agrupa por semana ISO e calcula brier1x2 + brierOver", () => {
    const rows: ResolvedSimRow[] = [
      row({
        actual_resolved_at: "2026-05-04T12:00:00Z",
        p_home: 0.6, p_draw: 0.25, p_away: 0.15,
        actual_home_goals: 2, actual_away_goals: 1,
        p_over_25: 0.55,
      }),
      row({
        actual_resolved_at: "2026-05-08T19:00:00Z",
        p_home: 0.4, p_draw: 0.3, p_away: 0.3,
        actual_home_goals: 0, actual_away_goals: 0,
        p_over_25: 0.5,
      }),
      row({
        actual_resolved_at: "2026-05-12T18:00:00Z",
        p_home: 0.5, p_draw: 0.25, p_away: 0.25,
        actual_home_goals: 1, actual_away_goals: 1,
        p_over_25: 0.4,
      }),
    ];
    const buckets = brierOverTime(rows, "week");
    expect(buckets.length).toBe(2);
    expect(buckets[0].bucket).toBe("2026-W20");
    expect(buckets[0].n).toBe(1);
    expect(buckets[1].bucket).toBe("2026-W19");
    expect(buckets[1].n).toBe(2);
    expect(buckets[0].brier1x2).not.toBeNull();
    expect(buckets[0].brierOver).not.toBeNull();
  });

  it("dataset vazio devolve []", () => {
    expect(brierOverTime([], "week")).toEqual([]);
  });
});

describe("marketDeviation", () => {
  it("calcula MAD entre p_home modelo e market por liga", () => {
    const rows: ResolvedSimRow[] = [
      row({
        league: "Premier League",
        p_home: 0.5,
        market_anchor: { Result: { Draw: 0.25, "Arsenal": 0.45, "Chelsea": 0.30 } },
      }),
      row({
        league: "Premier League",
        p_home: 0.6,
        market_anchor: { Result: { Draw: 0.20, "Liverpool": 0.55, "Brighton": 0.25 } },
      }),
      row({
        league: "La Liga",
        p_home: 0.42,
        market_anchor: { Result: { Draw: 0.28, "Real Madrid": 0.42, "Mallorca": 0.30 } },
      }),
    ];
    const dev = marketDeviation(rows);
    const pl = dev.find((d) => d.league === "Premier League");
    expect(pl?.n).toBe(2);
    expect(pl?.mad).toBeGreaterThan(0);

    const la = dev.find((d) => d.league === "La Liga");
    expect(la?.mad).toBeCloseTo(0, 3);
  });

  it("ignora rows sem market_anchor ou com formato inesperado", () => {
    const rows: ResolvedSimRow[] = [
      row({ league: "PL", market_anchor: null, p_home: 0.5 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      row({ league: "PL", market_anchor: "garbage" as any, p_home: 0.5 }),
      row({ league: "PL", market_anchor: { Result: {} }, p_home: 0.5 }),
    ];
    expect(marketDeviation(rows)).toEqual([]);
  });

  it("dataset vazio devolve []", () => {
    expect(marketDeviation([])).toEqual([]);
  });
});
