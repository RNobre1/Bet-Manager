/**
 * Insights engine — statistical signals derived from a fixture's recent matches.
 *
 * Four insight kinds, each with `kind`, `headline`, `text`, `confidence` (0..1):
 *   • correlation — top |r| ≥ 0.5 pairs of stats (sampleCorrelation)
 *   • trend       — linear regression slope ≥ |0.3 stat units / match|
 *   • pattern     — heuristic conditional rules over streaks + referee + matches
 *   • outlier     — single-match values ≥ 2σ from the mean (standardDeviation)
 *
 * `rankInsights(all, topN=6)` sorts by confidence DESC, dedupes by kind+headline.
 *
 * Tolerant by design: nulls in sources are skipped silently; sub-3 samples skip
 * correlation; sub-4 samples skip trend; zero variance skips outlier.
 */

import { mean, sampleCorrelation, standardDeviation } from "simple-statistics";
import regression, { type DataPoint } from "regression";

import type {
  NormalizedRecentMatch,
  RefereeRecord,
  Streaks,
} from "./detail-json-types";
import { readCorrelation, readTrend, readOutlier } from "./readings";

// ─── Types ───────────────────────────────────────────────────────────────

/** Numeric stat keys on a NormalizedRecentMatch (those used for analytics). */
export type InsightStatKey =
  | "goals_ft_for"
  | "goals_ft_against"
  | "goals_1h_for"
  | "goals_2h_for"
  | "corners_for"
  | "corners_against"
  | "corners_1h_for"
  | "corners_2h_for"
  | "cards_for"
  | "cards_1h_for"
  | "cards_2h_for"
  | "sot_for"
  | "sot_against"
  | "shots_for"
  | "booking_points_for"
  | "booking_points_against"
  | "fouls_for"
  | "offsides_for";

interface InsightBase {
  headline: string;
  text: string;
  /** 0..1 — sorting key used by rankInsights. */
  confidence: number;
}

export interface CorrelationInsight extends InsightBase {
  kind: "correlation";
  statA: InsightStatKey;
  statB: InsightStatKey;
  r: number;
}

export interface TrendInsight extends InsightBase {
  kind: "trend";
  stat: InsightStatKey;
  slope: number;
  direction: "up" | "down";
}

export interface PatternInsight extends InsightBase {
  kind: "pattern";
  code: string;
}

export interface OutlierInsight extends InsightBase {
  kind: "outlier";
  stat: InsightStatKey;
  matchId: number;
  value: number;
  zScore: number;
}

export type Insight =
  | CorrelationInsight
  | TrendInsight
  | PatternInsight
  | OutlierInsight;

export interface PatternContext {
  streaks: Streaks;
  referee: RefereeRecord | null;
  matches: NormalizedRecentMatch[];
}

// ─── Thresholds (conservative — prefer false negatives over noise) ──────

const CORR_R_THRESHOLD = 0.5;
const CORR_MIN_SAMPLES = 3;
const CORR_TOP_N = 10;

const TREND_SLOPE_THRESHOLD = 0.3;
const TREND_MIN_SAMPLES = 4;

const OUTLIER_Z_THRESHOLD = 2;
const OUTLIER_MIN_SAMPLES = 3;

const STREAK_PERC_HIGH = 70;
const REF_BP_HIGH = 45;
const CARDS_1H_AVG_HIGH = 0.5;

const DEFAULT_TOP_N = 6;

// ─── Helpers ─────────────────────────────────────────────────────────────

/** All stat keys eligible for correlation/trend/outlier analysis. */
const STAT_KEYS: InsightStatKey[] = [
  "goals_ft_for",
  "goals_ft_against",
  "goals_1h_for",
  "goals_2h_for",
  "corners_for",
  "corners_against",
  "corners_1h_for",
  "corners_2h_for",
  "cards_for",
  "cards_1h_for",
  "cards_2h_for",
  "sot_for",
  "sot_against",
  "shots_for",
  "booking_points_for",
  "booking_points_against",
  "fouls_for",
  "offsides_for",
];

// Pares estruturalmente determinísticos: correlação alta é tautológica, não sinal.
const TAUTOLOGICAL_PAIRS: ReadonlySet<string> = new Set([
  "cards_for|booking_points_for",
  "cards_against|booking_points_against",
  "goals_ft_for|goals_1h_for",
  "goals_ft_for|goals_2h_for",
  "goals_ft_against|goals_1h_against",
  "goals_ft_against|goals_2h_against",
]);

function isTautological(a: string, b: string): boolean {
  return (
    TAUTOLOGICAL_PAIRS.has(`${a}|${b}`) || TAUTOLOGICAL_PAIRS.has(`${b}|${a}`)
  );
}

/**
 * Extracts a non-null numeric series for a given stat key from a list of
 * matches. Returns the series and a parallel array of match ids preserving
 * the same ordering.
 */
function extractSeries(
  matches: NormalizedRecentMatch[],
  key: InsightStatKey,
): { values: number[]; ids: number[] } {
  const values: number[] = [];
  const ids: number[] = [];
  for (const m of matches) {
    const v = m[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      values.push(v);
      ids.push(m.id);
    }
  }
  return { values, ids };
}

/**
 * Pearson-r wrapper that tolerates length-mismatched or sub-3 series.
 * Returns null when correlation is undefined.
 */
function pearsonR(xs: number[], ys: number[]): number | null {
  if (xs.length !== ys.length) return null;
  if (xs.length < CORR_MIN_SAMPLES) return null;
  // simple-statistics throws if all-equal; guard manually.
  const sdX = standardDeviation(xs);
  const sdY = standardDeviation(ys);
  if (sdX === 0 || sdY === 0) return null;
  const r = sampleCorrelation(xs, ys);
  return Number.isFinite(r) ? r : null;
}

// ─── computeCorrelations ─────────────────────────────────────────────────

export function computeCorrelations(
  matches: NormalizedRecentMatch[],
): CorrelationInsight[] {
  if (!Array.isArray(matches) || matches.length < CORR_MIN_SAMPLES) return [];

  const out: CorrelationInsight[] = [];

  // Iterate over unique ordered pairs (i<j) so (A,B) and (B,A) cannot both
  // appear. Each pair runs once.
  for (let i = 0; i < STAT_KEYS.length; i++) {
    for (let j = i + 1; j < STAT_KEYS.length; j++) {
      const keyA = STAT_KEYS[i];
      const keyB = STAT_KEYS[j];
      if (isTautological(keyA, keyB)) continue;
      // Build aligned series using only matches where BOTH stats are present.
      const xs: number[] = [];
      const ys: number[] = [];
      for (const m of matches) {
        const a = m[keyA];
        const b = m[keyB];
        if (
          typeof a === "number" &&
          Number.isFinite(a) &&
          typeof b === "number" &&
          Number.isFinite(b)
        ) {
          xs.push(a);
          ys.push(b);
        }
      }
      const r = pearsonR(xs, ys);
      if (r === null) continue;
      if (Math.abs(r) < CORR_R_THRESHOLD) continue;
      const reading = readCorrelation(keyA, keyB, r);
      out.push({
        kind: "correlation",
        statA: keyA,
        statB: keyB,
        r,
        headline: reading.title,
        text: reading.text,
        confidence: Math.min(1, Math.abs(r)),
      });
    }
  }

  // Top N by |r| descending.
  out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return out.slice(0, CORR_TOP_N);
}

// ─── computeTrends ───────────────────────────────────────────────────────

export function computeTrends(
  matches: NormalizedRecentMatch[],
): TrendInsight[] {
  if (!Array.isArray(matches) || matches.length < TREND_MIN_SAMPLES) return [];

  const out: TrendInsight[] = [];

  for (const key of STAT_KEYS) {
    const { values } = extractSeries(matches, key);
    if (values.length < TREND_MIN_SAMPLES) continue;

    // Build (x, y) where x = ordinal index (0..n-1). The slope reports
    // "stat units per match".
    const data: DataPoint[] = values.map((v, i) => [i, v]);
    const result = regression.linear(data, { precision: 6 });
    const slope = result.equation[0];
    if (!Number.isFinite(slope)) continue;
    if (Math.abs(slope) < TREND_SLOPE_THRESHOLD) continue;

    const direction: "up" | "down" = slope > 0 ? "up" : "down";
    // Confidence: |slope| capped at 1, blended with r²
    const r2 = Number.isFinite(result.r2) ? result.r2 : 0;
    const slopeConf = Math.min(1, Math.abs(slope));
    const confidence = Math.min(1, 0.5 * slopeConf + 0.5 * r2);
    const reading = readTrend(key, slope);

    out.push({
      kind: "trend",
      stat: key,
      slope,
      direction,
      headline: reading.title,
      text: reading.text,
      confidence,
    });
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

// ─── computePatterns ─────────────────────────────────────────────────────

export function computePatterns(ctx: PatternContext): PatternInsight[] {
  const out: PatternInsight[] = [];
  const streaksAll: NonNullable<Streaks["home"]> = [
    ...(ctx.streaks?.home ?? []),
    ...(ctx.streaks?.away ?? []),
  ];

  // Pattern 1: BTTS streak ≥ 70% + ref avg BP > 45 → high-BP pattern
  if (ctx.referee && ctx.referee.avg_total_booking_points > REF_BP_HIGH) {
    const bttsStreak = streaksAll.find(
      (s) =>
        s.group === "BTTS" &&
        typeof s.overall_perc === "number" &&
        s.overall_perc >= STREAK_PERC_HIGH,
    );
    if (bttsStreak) {
      const perc = bttsStreak.overall_perc;
      const bp = ctx.referee.avg_total_booking_points;
      // Confidence blend: streak strength (0..1) × ref signal (0..1)
      const streakStrength = Math.min(1, perc / 100);
      const refStrength = Math.min(1, (bp - REF_BP_HIGH) / 30 + 0.5);
      const confidence = Math.min(1, 0.5 * streakStrength + 0.5 * refStrength);
      out.push({
        kind: "pattern",
        code: "btts_high_bp",
        headline: `BTTS forte (${perc}%) com árbitro de cartão (BP ${bp.toFixed(0)})`,
        text: `Streak BTTS em ${perc}% combinado com média ${bp.toFixed(1)} booking points por jogo do árbitro sugere mais um confronto aberto e cartão.`,
        confidence,
      });
    }
  }

  // Pattern 2: cards_1h average ≥ 0.5 + ref avg BP > 45 → cards_1h pattern
  if (
    ctx.referee &&
    ctx.referee.avg_total_booking_points > REF_BP_HIGH &&
    Array.isArray(ctx.matches) &&
    ctx.matches.length > 0
  ) {
    const cards1hValues = ctx.matches
      .map((m) => m.cards_1h_for)
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    if (cards1hValues.length > 0) {
      const avgCards1h = mean(cards1hValues);
      if (avgCards1h >= CARDS_1H_AVG_HIGH) {
        const bp = ctx.referee.avg_total_booking_points;
        const cardsStrength = Math.min(1, avgCards1h);
        const refStrength = Math.min(1, (bp - REF_BP_HIGH) / 30 + 0.5);
        const confidence = Math.min(
          1,
          0.5 * cardsStrength + 0.5 * refStrength,
        );
        out.push({
          kind: "pattern",
          code: "cards_1h_high_ref",
          headline: `Cartão no 1T frequente (${avgCards1h.toFixed(2)}/jogo) + árbitro rígido`,
          text: `Média de ${avgCards1h.toFixed(2)} cartões no 1T nos últimos ${cards1hValues.length} jogos somada à média ${bp.toFixed(1)} BP do árbitro reforça aposta de cartão cedo.`,
          confidence,
        });
      }
    }
  }

  return out;
}

// ─── computeOutliers ─────────────────────────────────────────────────────

export function computeOutliers(
  matches: NormalizedRecentMatch[],
): OutlierInsight[] {
  if (!Array.isArray(matches) || matches.length < OUTLIER_MIN_SAMPLES)
    return [];

  const out: OutlierInsight[] = [];

  for (const key of STAT_KEYS) {
    const { values, ids } = extractSeries(matches, key);
    if (values.length < OUTLIER_MIN_SAMPLES) continue;
    const sd = standardDeviation(values);
    if (sd === 0) continue;
    const mu = mean(values);
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const z = (v - mu) / sd;
      if (Math.abs(z) < OUTLIER_Z_THRESHOLD) continue;
      const reading = readOutlier(key, v, mu);
      out.push({
        kind: "outlier",
        stat: key,
        matchId: ids[i],
        value: v,
        zScore: z,
        headline: reading.title,
        text: reading.text,
        confidence: Math.min(1, Math.abs(z) / 4),
      });
    }
  }

  out.sort((a, b) => b.confidence - a.confidence);
  return out;
}

// ─── rankInsights ────────────────────────────────────────────────────────

export function rankInsights(
  insights: Insight[],
  topN: number = DEFAULT_TOP_N,
): Insight[] {
  if (!Array.isArray(insights) || insights.length === 0) return [];

  const sorted = [...insights].sort((a, b) => b.confidence - a.confidence);
  const seen = new Set<string>();
  const out: Insight[] = [];
  for (const ins of sorted) {
    const key = `${ins.kind}|${ins.headline}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ins);
    if (out.length >= topN) break;
  }
  return out;
}
