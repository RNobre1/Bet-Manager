/**
 * Panel N — Statistical insights (correlation / trend / pattern / outlier).
 *
 * Renders the array `as-passed` (the caller already invoked `rankInsights`
 * from `lib/fixtures/stats/insights.ts`, which sorts by confidence DESC).
 * Returns `null` when the array is empty.
 *
 * Each card has a vermelho left-border + a per-kind unicode glyph. We keep
 * the icon set tiny (no extra dep) and rely on tokens for color.
 */

import type { Insight } from "@/lib/fixtures/stats/insights";

interface InsightsProps {
  insights: Insight[];
}

const ICON_BY_KIND: Record<Insight["kind"], string> = {
  correlation: "∝",
  trend: "↗",
  pattern: "◈",
  outlier: "‼",
};

export function Insights({ insights }: InsightsProps) {
  if (!Array.isArray(insights) || insights.length === 0) return null;

  return (
    <div className="card flex flex-col gap-3 p-4 lg:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[var(--color-ink-display)]">
          Insights
        </h3>
        <span className="label text-[var(--color-ink-faint)]">
          {insights.length}
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {insights.map((ins, idx) => (
          <li
            key={`${ins.kind}-${idx}`}
            data-insight
            data-kind={ins.kind}
            className="flex gap-3 rounded-md bg-[var(--color-surface-2)] p-3"
            style={{
              borderLeft: "3px solid var(--color-vermelho)",
            }}
          >
            <span
              data-insight-icon
              aria-hidden
              className="num text-xl text-[var(--color-vermelho)]"
            >
              {ICON_BY_KIND[ins.kind]}
            </span>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-[var(--color-ink-display)]">
                {ins.headline}
              </span>
              <span className="text-sm text-[var(--color-ink-muted)]">
                {ins.text}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
