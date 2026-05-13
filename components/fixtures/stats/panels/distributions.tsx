/**
 * Panel M — Boxplots min/Q1/median/Q3/max for each stat key.
 *
 * Pure CSS boxplot — no chart lib. The geometry is computed on the server
 * (since this is a Server Component) and rendered as absolute-positioned
 * spans inside a horizontal track. Home boxplots use `--color-vermelho`,
 * away boxplots use `--color-depth` — matching the T-spec.
 *
 * Visual layout per stat:
 *   ├──── whisker ──┤▓▓▓ box ▓▓▓│ ▓▓▓ box ▓▓▓├── whisker ────┤
 *                              ^ median line
 * Each piece is a percentage of the full extent (max - min). When max == min
 * the row collapses to a single point — we render an empty track to avoid
 * NaN positions.
 */

import { PanelShell } from "@/components/fixtures/stats/panels/_shell";
import type {
  BoxStats,
  Distributions as Dist,
  StatKey,
} from "@/lib/fixtures/stats/detail-json-types";

interface DistributionsProps {
  home: Dist;
  away: Dist;
}

const STAT_LABEL: Record<StatKey, string> = {
  goals_ft_for: "Gols pró",
  goals_ft_against: "Gols sofridos",
  corners_for: "Cantos pró",
  corners_against: "Cantos sofridos",
  cards_for: "Cartões pró",
  sot_for: "Chutes no gol",
  booking_points_for: "Booking points",
};

const ORDER: StatKey[] = [
  "goals_ft_for",
  "goals_ft_against",
  "corners_for",
  "corners_against",
  "cards_for",
  "sot_for",
  "booking_points_for",
];

interface BoxplotProps {
  stats: BoxStats;
  color: string;
}

function pct(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  return ((value - min) / (max - min)) * 100;
}

function Boxplot({ stats, color }: BoxplotProps) {
  const { min, q1, median, q3, max } = stats;
  const collapsed = max <= min;
  const q1Pct = pct(q1, min, max);
  const q3Pct = pct(q3, min, max);
  const medianPct = pct(median, min, max);

  return (
    <div
      data-boxplot
      className="relative h-5 w-full rounded-sm bg-[var(--color-surface-2)]"
      aria-label={`min ${min} q1 ${q1} median ${median} q3 ${q3} max ${max}`}
    >
      {/* Whisker line (full extent) */}
      <span
        aria-hidden
        className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
        style={{ backgroundColor: color, opacity: 0.4 }}
      />
      {/* Inner box: q1 → q3 */}
      <span
        data-box
        aria-hidden
        className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm"
        style={{
          left: collapsed ? "0%" : `${q1Pct}%`,
          width: collapsed ? "0%" : `${q3Pct - q1Pct}%`,
          backgroundColor: color,
          opacity: 0.55,
        }}
      />
      {/* Median tick */}
      <span
        data-median
        aria-hidden
        className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2"
        style={{
          left: collapsed ? "0%" : `${medianPct}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

function SideColumn({
  side,
  data,
  color,
}: {
  side: "home" | "away";
  data: Dist;
  color: string;
}) {
  return (
    <div data-side={side} className="flex flex-col gap-2">
      {ORDER.map((k) => {
        const stats = data[k];
        return (
          <div key={k} className="grid grid-cols-[8rem_1fr] items-center gap-2">
            <span className="label text-[var(--color-ink-faint)]">
              {STAT_LABEL[k]}
            </span>
            <Boxplot stats={stats} color={color} />
          </div>
        );
      })}
    </div>
  );
}

export function Distributions({ home, away }: DistributionsProps) {
  return (
    <PanelShell
      title="Distribuições"
      eyebrow="min · Q1 · mediana · Q3 · max"
      gap={4}
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section>
          <h4 className="label mb-2 text-[var(--color-ink-faint)]">casa</h4>
          <SideColumn side="home" data={home} color="var(--color-vermelho)" />
        </section>
        <section>
          <h4 className="label mb-2 text-[var(--color-ink-faint)]">fora</h4>
          <SideColumn side="away" data={away} color="var(--color-depth)" />
        </section>
      </div>
    </PanelShell>
  );
}
