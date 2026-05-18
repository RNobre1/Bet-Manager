import { describe, it, expect } from "vitest";
import {
  scoreWinner,
  scoreOverUnder,
  hitRate,
  calibrationBuckets,
  type ResolvedPrediction,
} from "./calibration-metrics";

// ── scoreWinner ───────────────────────────────────────────────────────────────

describe("scoreWinner", () => {
  it("home vence (2-1) → pred home = true", () => {
    expect(scoreWinner("home", 2, 1)).toBe(true);
  });
  it("empate (1-1) → pred draw = true", () => {
    expect(scoreWinner("draw", 1, 1)).toBe(true);
  });
  it("away vence (0-3) → pred away = true", () => {
    expect(scoreWinner("away", 0, 3)).toBe(true);
  });
  it("home vence mas pred é draw → false", () => {
    expect(scoreWinner("draw", 2, 1)).toBe(false);
  });
  it("empate mas pred é home → false", () => {
    expect(scoreWinner("home", 1, 1)).toBe(false);
  });
});

// ── scoreOverUnder ────────────────────────────────────────────────────────────

describe("scoreOverUnder", () => {
  it("placar 2-1 = 3 gols → over", () => {
    expect(scoreOverUnder("over", 2, 1)).toBe(true);
  });
  it("placar 1-1 = 2 gols → under (≤2.5)", () => {
    expect(scoreOverUnder("under", 1, 1)).toBe(true);
  });
  it("placar 2-1 = 3 gols, pred under → false", () => {
    expect(scoreOverUnder("under", 2, 1)).toBe(false);
  });
  it("placar 1-1 = 2 gols, pred over → false", () => {
    expect(scoreOverUnder("over", 1, 1)).toBe(false);
  });
  it("placar 3-0 = 3 gols (over), pred over → true", () => {
    expect(scoreOverUnder("over", 3, 0)).toBe(true);
  });
  it("placar 1-0 = 1 gol, pred under → true", () => {
    expect(scoreOverUnder("under", 1, 0)).toBe(true);
  });
  it("placar exato 2-0 = 2 gols → under (limite: 2.5)", () => {
    expect(scoreOverUnder("under", 2, 0)).toBe(true);
  });
  it("placar 2-1 = 3 gols (exatamente >2.5) → over", () => {
    expect(scoreOverUnder("over", 2, 1)).toBe(true);
  });
});

// ── hitRate ───────────────────────────────────────────────────────────────────

describe("hitRate", () => {
  it("sem linhas resolvidas → null", () => {
    expect(hitRate([])).toBeNull();
  });

  it("1 acerto winner, 0 over_under → {winner:1, overUnder:0}", () => {
    const rows: ResolvedPrediction[] = [
      { correct_winner: true, correct_over_under: false },
    ];
    expect(hitRate(rows)).toEqual({ winner: 1, overUnder: 0 });
  });

  it("2 rows: 1 winner certo + 1 errado → 50%", () => {
    const rows: ResolvedPrediction[] = [
      { correct_winner: true, correct_over_under: true },
      { correct_winner: false, correct_over_under: true },
    ];
    const result = hitRate(rows)!;
    expect(result.winner).toBeCloseTo(0.5);
    expect(result.overUnder).toBeCloseTo(1.0);
  });

  it("todas certas → 100%", () => {
    const rows: ResolvedPrediction[] = [
      { correct_winner: true, correct_over_under: true },
      { correct_winner: true, correct_over_under: true },
    ];
    expect(hitRate(rows)).toEqual({ winner: 1, overUnder: 1 });
  });
});

// ── calibrationBuckets ────────────────────────────────────────────────────────

describe("calibrationBuckets", () => {
  it("sem rows → retorna array vazio (nBuckets buckets todos com n=0)", () => {
    const result = calibrationBuckets([], 5);
    expect(result).toHaveLength(5);
    expect(result.every((b) => b.n === 0)).toBe(true);
  });

  it("rows concentradas em alta confiança → bucket correto tem predictedAvg alto", () => {
    // confidence=0.9 → deve cair no bucket [0.8, 1.0] (4º de 5)
    const rows: Array<ResolvedPrediction & { pred_confidence: number }> = [
      { pred_confidence: 0.9, correct_winner: true, correct_over_under: true },
      { pred_confidence: 0.85, correct_winner: false, correct_over_under: true },
    ];
    const buckets = calibrationBuckets(rows, 5);
    const highBucket = buckets[4]; // último bucket [0.8, 1.0]
    expect(highBucket.n).toBe(2);
    expect(highBucket.predictedAvg).toBeCloseTo(0.875); // média de 0.9 e 0.85
    expect(highBucket.realizedAccuracy).toBeCloseTo(0.5); // 1 de 2 acertou winner
  });

  it("default nBuckets=5 produz 5 buckets cobrindo [0,1]", () => {
    const result = calibrationBuckets([]);
    expect(result).toHaveLength(5);
    expect(result[0].range[0]).toBe(0);
    expect(result[4].range[1]).toBe(1);
  });

  it("cada bucket tem range correto para 4 buckets", () => {
    const result = calibrationBuckets([], 4);
    expect(result[0].range).toEqual([0, 0.25]);
    expect(result[1].range).toEqual([0.25, 0.5]);
    expect(result[2].range).toEqual([0.5, 0.75]);
    expect(result[3].range).toEqual([0.75, 1]);
  });
});
