"use client";

import { useMemo, useState } from "react";
import regression from "regression";
import type { NormalizedRecentMatch } from "@/lib/fixtures/stats/detail-json-types";
import { TimeSeriesLine } from "@/components/charts/time-series-line";

/**
 * Stat keys exposed in the toggle. Each maps to a numeric field on
 * NormalizedRecentMatch — null values get coerced to 0 for the chart
 * (recharts skips null without warning but the trend regression dies).
 */
type ToggleKey = "goals_ft" | "sot" | "corners" | "booking_points";

const CHIPS: Array<{ key: ToggleKey; label: string }> = [
  { key: "goals_ft", label: "gols FT" },
  { key: "sot", label: "SOT" },
  { key: "corners", label: "cantos" },
  { key: "booking_points", label: "booking" },
];

function valueOf(m: NormalizedRecentMatch, key: ToggleKey): number {
  switch (key) {
    case "goals_ft":
      return m.goals_ft_for ?? 0;
    case "sot":
      return m.sot_for ?? 0;
    case "corners":
      return m.corners_for ?? 0;
    case "booking_points":
      return m.booking_points_for ?? 0;
  }
}

interface RecentMatchesPanelProps {
  matches: NormalizedRecentMatch[];
  title: string;
  /** Fixed chart width for tests; omit in prod for ResponsiveContainer. */
  width?: number;
  height?: number;
}

/**
 * Painel C+ · recent matches — uma série numérica por chip selecionável,
 * com sobreposição de uma trend line dashed via regressão linear.
 *
 * Os dados vêm já ordenados (newest → oldest do derive); pra plotar
 * cronologicamente reverso o array antes de pôr na chart.
 */
export function RecentMatchesPanel({
  matches,
  title,
  width,
  height = 240,
}: RecentMatchesPanelProps) {
  const [active, setActive] = useState<ToggleKey>("goals_ft");

  const chrono = useMemo(() => [...matches].reverse(), [matches]);

  const chartData = useMemo(() => {
    if (chrono.length === 0) return [];
    // Linear regression on indexed points so the trend is plotted at the
    // same x positions as the actual series.
    const points: Array<[number, number]> = chrono.map((m, i) => [
      i,
      valueOf(m, active),
    ]);
    const result = regression.linear(points, { precision: 6 });
    return chrono.map((m, i) => ({
      label: m.date_iso || `J${i + 1}`,
      value: valueOf(m, active),
      trend: result.points[i]?.[1] ?? null,
    }));
  }, [chrono, active]);

  if (matches.length === 0) {
    return (
      <div
        className="card flex items-center justify-center p-4"
        style={{ height }}
      >
        <span className="label text-[var(--color-ink-faint)]">sem dados</span>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="label">{title}</span>
        <div className="flex flex-wrap gap-1">
          {CHIPS.map((c) => {
            const isActive = c.key === active;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActive(c.key)}
                className="label px-2 py-1 transition"
                style={{
                  background: isActive
                    ? "var(--color-vermelho)"
                    : "var(--color-surface-2)",
                  color: isActive
                    ? "var(--color-ink-display)"
                    : "var(--color-ink-muted)",
                  border: "1px solid var(--color-ink-faint)",
                  borderRadius: 4,
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>
      <TimeSeriesLine
        data={chartData}
        xKey="label"
        series={[
          {
            key: "value",
            label: CHIPS.find((c) => c.key === active)!.label,
            color: "#c42b2b",
          },
          {
            key: "trend",
            label: "tendência",
            color: "#7a7872",
            dashed: true,
          },
        ]}
        width={width}
        height={height}
      />
    </div>
  );
}
