import type { ReactNode } from "react";

export interface ReferenceLine {
  value: number;
  label: string;
  color: string;
}

interface Props {
  yTicks: number[]; // descending domain ticks, top→bottom
  xLabels: string[];
  referenceLines?: ReferenceLine[];
  /** Assumes a zero-based domain (referenceLines positioned as value/yMax). */
  yMax?: number; // defaults to max(yTicks)
  height?: number;
  children: ReactNode; // the actual chart, absolutely filling the plot
}

export function ChartFrame({
  yTicks,
  xLabels,
  referenceLines = [],
  yMax,
  height = 160,
  children,
}: Props) {
  const max = yMax ?? Math.max(...yTicks, 1);
  return (
    <div
      data-chart-frame
      style={{ position: "relative", paddingLeft: 28, height }}
    >
      <div
        style={{ position: "absolute", left: 0, top: 0, bottom: 18, width: 24 }}
        className="flex flex-col justify-between text-right num text-[9px] text-[var(--color-ink-faint)]"
      >
        {[...yTicks]
          .sort((a, b) => b - a)
          .map((t) => (
            <span key={t}>{t}</span>
          ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: 28,
          right: 0,
          top: 0,
          bottom: 18,
        }}
        className="border-l border-b border-[var(--color-surface-3)]"
      >
        {referenceLines.map((r) => (
          <div key={r.label}>
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: `${(r.value / max) * 100}%`,
                borderTop: `1px dashed ${r.color}`,
              }}
            />
            <span
              style={{
                position: "absolute",
                right: 2,
                bottom: `${(r.value / max) * 100}%`,
              }}
              className="num text-[9px] text-[var(--color-ink-muted)]"
            >
              {r.label}
            </span>
          </div>
        ))}
        {children}
      </div>
      <div
        style={{
          position: "absolute",
          left: 28,
          right: 0,
          bottom: 0,
          height: 16,
        }}
        className="flex justify-between num text-[9px] text-[var(--color-ink-faint)]"
      >
        {xLabels.map((l, i) => (
          <span key={`${l}-${i}`}>{l}</span>
        ))}
      </div>
    </div>
  );
}
