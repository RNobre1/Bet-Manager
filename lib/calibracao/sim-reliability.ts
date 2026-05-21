import { brierScore, brierScoreMulticlass } from "@/lib/ai/calibration-metrics";

export interface ResolvedSimRow {
  league: string | null;
  p_home: number | null;
  p_draw: number | null;
  p_away: number | null;
  p_over_25: number | null;
  market_anchor: unknown;
  actual_home_goals: number | null;
  actual_away_goals: number | null;
  actual_resolved_at: string | null;
}

export interface ReliabilityBin {
  range: [number, number];
  n: number;
  predictedAvg: number | null;
  observedFreq: number | null;
}

export type ReliabilityMetric = "1x2-home" | "over25";

export function reliabilityBins(
  rows: ResolvedSimRow[],
  metric: ReliabilityMetric,
): ReliabilityBin[] {
  const bins: ReliabilityBin[] = [];
  for (let i = 0; i < 10; i++) {
    bins.push({
      range: [i / 10, (i + 1) / 10],
      n: 0,
      predictedAvg: null,
      observedFreq: null,
    });
  }
  const acc: Array<{ sumP: number; sumObs: number; n: number }> = bins.map(() => ({
    sumP: 0,
    sumObs: 0,
    n: 0,
  }));

  for (const r of rows) {
    const p = metric === "1x2-home" ? r.p_home : r.p_over_25;
    if (p == null || !Number.isFinite(p)) continue;
    const hg = r.actual_home_goals;
    const ag = r.actual_away_goals;
    if (hg == null || ag == null) continue;

    const observed = metric === "1x2-home"
      ? (hg > ag ? 1 : 0)
      : (hg + ag > 2.5 ? 1 : 0);

    const idx = Math.min(9, Math.max(0, Math.floor(p * 10)));
    acc[idx].sumP += p;
    acc[idx].sumObs += observed;
    acc[idx].n += 1;
  }

  for (let i = 0; i < 10; i++) {
    if (acc[i].n > 0) {
      bins[i].n = acc[i].n;
      bins[i].predictedAvg = acc[i].sumP / acc[i].n;
      bins[i].observedFreq = acc[i].sumObs / acc[i].n;
    }
  }
  return bins;
}

export interface BrierBucket {
  bucket: string;
  n: number;
  brier1x2: number | null;
  brierOver: number | null;
}

export function brierOverTime(
  rows: ResolvedSimRow[],
  granularity: "week" | "month",
): BrierBucket[] {
  const groups = new Map<string, { sum1: number; n1: number; sumO: number; nO: number }>();
  for (const r of rows) {
    if (!r.actual_resolved_at) continue;
    const date = new Date(r.actual_resolved_at);
    if (Number.isNaN(date.getTime())) continue;
    const key = granularity === "week" ? isoWeekLabel(date) : isoMonthLabel(date);
    const g = groups.get(key) ?? { sum1: 0, n1: 0, sumO: 0, nO: 0 };

    const ph = Number(r.p_home);
    const pd = Number(r.p_draw);
    const pa = Number(r.p_away);
    const hg = r.actual_home_goals;
    const ag = r.actual_away_goals;
    if (
      hg != null && ag != null &&
      Number.isFinite(ph) && Number.isFinite(pd) && Number.isFinite(pa)
    ) {
      const outcome: "home" | "draw" | "away" = hg > ag ? "home" : hg < ag ? "away" : "draw";
      g.sum1 += brierScoreMulticlass({ home: ph, draw: pd, away: pa }, outcome);
      g.n1 += 1;
    }
    const pOver = Number(r.p_over_25);
    if (hg != null && ag != null && Number.isFinite(pOver)) {
      g.sumO += brierScore(pOver, hg + ag > 2.5 ? 1 : 0);
      g.nO += 1;
    }
    groups.set(key, g);
  }

  return Array.from(groups.entries())
    .map(([bucket, g]) => ({
      bucket,
      n: Math.max(g.n1, g.nO),
      brier1x2: g.n1 > 0 ? g.sum1 / g.n1 : null,
      brierOver: g.nO > 0 ? g.sumO / g.nO : null,
    }))
    .sort((a, b) => (a.bucket < b.bucket ? 1 : a.bucket > b.bucket ? -1 : 0));
}

function isoWeekLabel(d: Date): string {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function isoMonthLabel(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface MarketDeviation {
  league: string;
  n: number;
  mad: number;
  modelMean: number;
  marketMean: number;
}

/**
 * Desvio entre p_home modelo e probabilidade implícita do mercado por liga.
 * `market_anchor.Result` é keyed por nome de time longo OU por "Draw"; quando
 * não conseguimos identificar qual outcome é "home" pelo nome (que não vem
 * neste payload por design), usamos o MAIOR p NÃO-Draw como proxy do
 * favorito. NÃO é perfeito — é heurística honesta pra sinal de viés
 * sistemático ("modelo sempre acima do mercado em PL?"). Casos exatos vão
 * precisar de coluna home_team aqui (out of scope na F2).
 */
export function marketDeviation(rows: ResolvedSimRow[]): MarketDeviation[] {
  const byLeague = new Map<string, { sumAbs: number; sumP: number; sumM: number; n: number }>();
  for (const r of rows) {
    if (!r.league) continue;
    const p = Number(r.p_home);
    if (!Number.isFinite(p)) continue;
    const m = extractMarketHome(r.market_anchor);
    if (m == null) continue;

    const g = byLeague.get(r.league) ?? { sumAbs: 0, sumP: 0, sumM: 0, n: 0 };
    g.sumAbs += Math.abs(p - m);
    g.sumP += p;
    g.sumM += m;
    g.n += 1;
    byLeague.set(r.league, g);
  }
  return Array.from(byLeague.entries())
    .map(([league, g]) => ({
      league,
      n: g.n,
      mad: g.sumAbs / g.n,
      modelMean: g.sumP / g.n,
      marketMean: g.sumM / g.n,
    }))
    .sort((a, b) => b.n - a.n);
}

function extractMarketHome(anchor: unknown): number | null {
  if (!anchor || typeof anchor !== "object") return null;
  const result = (anchor as Record<string, unknown>).Result;
  if (!result || typeof result !== "object") return null;
  const entries = Object.entries(result as Record<string, unknown>).filter(
    ([k]) => k.toLowerCase() !== "draw",
  );
  if (entries.length === 0) return null;
  const probs = entries
    .map(([, v]) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0);
  if (probs.length === 0) return null;
  return Math.max(...probs);
}
