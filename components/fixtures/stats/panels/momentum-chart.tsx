"use client";

import { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";
import type { ISeriesApi, IChartApi } from "lightweight-charts";

/**
 * One point on a momentum line. `time` is an ISO date ("YYYY-MM-DD") —
 * lightweight-charts accepts that natively. `value` is the rolling
 * average (goals/sot/whatever) the parent picked.
 */
export interface MomentumPoint {
  time: string;
  value: number;
}

interface MomentumChartProps {
  homeTeam: string;
  awayTeam: string;
  home: MomentumPoint[];
  away: MomentumPoint[];
  height?: number;
}

/**
 * Painel B · momentum trend (lightweight-charts canvas).
 *
 * Renders two line series — home (vermelho) and away (depth blue) — on
 * a single chart so the visual rhythm of "who is climbing" reads at a
 * glance. lightweight-charts (over recharts) because canvas-based
 * rendering stays smooth past ~10 points where SVG-per-dot degrades.
 *
 * The chart instance is created in a useEffect cleanup pair so a remount
 * (StrictMode dev double-render) does not leak a Chromium canvas.
 */
export function MomentumChart({
  homeTeam,
  awayTeam,
  home,
  away,
  height = 240,
}: MomentumChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isEmpty = home.length === 0 && away.length === 0;

  useEffect(() => {
    if (isEmpty) return;
    const container = containerRef.current;
    if (!container) return;

    const chart: IChartApi = createChart(container, {
      width: container.clientWidth || 480,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "#7a7872", // --color-ink-muted
      },
      grid: {
        vertLines: { color: "rgba(63, 61, 58, 0.25)" },
        horzLines: { color: "rgba(63, 61, 58, 0.25)" },
      },
      rightPriceScale: { borderColor: "rgba(63, 61, 58, 0.4)" },
      timeScale: { borderColor: "rgba(63, 61, 58, 0.4)" },
      crosshair: { mode: 1 },
    });

    if (home.length > 0) {
      const homeSeries: ISeriesApi<"Line"> = chart.addLineSeries({
        color: "#c42b2b", // --color-vermelho
        lineWidth: 2,
        title: homeTeam,
      });
      homeSeries.setData(home);
    }

    if (away.length > 0) {
      const awaySeries: ISeriesApi<"Line"> = chart.addLineSeries({
        color: "#1a5fad", // --color-depth
        lineWidth: 2,
        title: awayTeam,
      });
      awaySeries.setData(away);
    }

    chart.timeScale().fitContent();

    return () => {
      chart.remove();
    };
    // We intentionally depend on the team names + raw series; if the parent
    // swaps fixtures the whole chart is rebuilt.
  }, [home, away, homeTeam, awayTeam, height, isEmpty]);

  if (isEmpty) {
    return (
      <div
        className="card flex items-center justify-center"
        style={{ height }}
      >
        <span className="label text-[var(--color-ink-faint)]">sem dados</span>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-3">
      <div className="mb-2 flex items-center gap-3">
        <span className="label">momentum</span>
        <span className="num text-xs text-[var(--color-vermelho)]">
          ● {homeTeam}
        </span>
        <span className="num text-xs text-[var(--color-depth)]">
          ● {awayTeam}
        </span>
      </div>
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}
