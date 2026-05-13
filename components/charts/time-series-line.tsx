"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/**
 * Generic time-series line chart. Wraps recharts' LineChart with the
 * Abissal dark theme tokens so every panel renders consistently.
 *
 * `width` is an optional escape hatch for unit tests — recharts'
 * <ResponsiveContainer> reports width:0 under happy-dom, which collapses
 * paths to zero length and breaks DOM-based assertions.
 */
export interface TimeSeriesSeries {
  /** Key on each data row that holds the y value for this series. */
  key: string;
  label: string;
  color: string;
  /** Render as a dashed trend overlay. */
  dashed?: boolean;
}

interface TimeSeriesLineProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  series: TimeSeriesSeries[];
  /** Fixed width — when omitted, ResponsiveContainer takes over. */
  width?: number;
  /** Chart height in px (default 240). */
  height?: number;
}

export function TimeSeriesLine({
  data,
  xKey,
  series,
  width,
  height = 240,
}: TimeSeriesLineProps) {
  if (data.length === 0) {
    return (
      <div
        className="label flex items-center justify-center text-[var(--color-ink-faint)]"
        style={{ height }}
      >
        sem dados
      </div>
    );
  }

  const lines = series.map((s) => (
    <Line
      key={s.key}
      type="monotone"
      dataKey={s.key}
      name={s.label}
      stroke={s.color}
      strokeWidth={s.dashed ? 1.5 : 2}
      strokeDasharray={s.dashed ? "4 4" : undefined}
      dot={s.dashed ? false : { r: 3, fill: s.color }}
      activeDot={{ r: 4 }}
      isAnimationActive={false}
    />
  ));

  const innerProps = {
    data,
    margin: { top: 8, right: 16, left: -16, bottom: 0 },
  } as const;

  const decorations = (
    <>
      <CartesianGrid stroke="var(--color-ink-faint)" strokeOpacity={0.15} />
      <XAxis
        dataKey={xKey}
        tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
        stroke="var(--color-ink-faint)"
      />
      <YAxis
        tick={{ fill: "var(--color-ink-muted)", fontSize: 11 }}
        stroke="var(--color-ink-faint)"
      />
      <Tooltip
        contentStyle={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-ink-faint)",
          color: "var(--color-ink-display)",
          fontSize: 12,
        }}
        labelStyle={{ color: "var(--color-ink-muted)" }}
      />
    </>
  );

  if (width !== undefined) {
    return (
      <LineChart width={width} height={height} {...innerProps}>
        {decorations}
        {lines}
      </LineChart>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart {...innerProps}>
        {decorations}
        {lines}
      </LineChart>
    </ResponsiveContainer>
  );
}
