/**
 * Panel N — Statistical insights (correlation / trend / pattern / outlier).
 *
 * Renders the array `as-passed` (the caller already invoked `rankInsights`
 * from `lib/fixtures/stats/insights.ts`, which sorts by confidence DESC).
 * Returns `null` when the array is empty.
 *
 * Each card has a vermelho left-border + a per-kind word label (instead of
 * an opaque unicode glyph). The label is colored per kind via tokens so the
 * reader can scan kinds at a glance without decoding symbols.
 */

import { PanelShell } from "@/components/fixtures/stats/panels/_shell";
import type { Insight } from "@/lib/fixtures/stats/insights";

interface InsightsProps {
  insights: Insight[];
}

const LABEL_BY_KIND: Record<Insight["kind"], string> = {
  correlation: "CORRELAÇÃO",
  trend: "TENDÊNCIA",
  pattern: "PADRÃO",
  outlier: "OUTLIER",
};

const COLOR_BY_KIND: Record<Insight["kind"], string> = {
  correlation: "var(--color-vermelho)",
  trend: "var(--color-success)",
  pattern: "var(--color-depth)",
  outlier: "var(--color-warning)",
};

export function Insights({ insights }: InsightsProps) {
  if (!Array.isArray(insights) || insights.length === 0) return null;

  return (
    <PanelShell title="Insights" eyebrow={insights.length}>
      <ul className="flex flex-col gap-2">
        {insights.map((ins, idx) => (
          <li
            key={`${ins.kind}-${idx}`}
            data-insight
            data-kind={ins.kind}
            className="flex flex-col gap-0.5 rounded-md bg-[var(--color-surface-2)] p-3"
            style={{
              borderLeft: "3px solid var(--color-vermelho)",
            }}
          >
            <span
              data-insight-label
              className="label"
              style={{ color: COLOR_BY_KIND[ins.kind] }}
            >
              {LABEL_BY_KIND[ins.kind]}
            </span>
            <span className="font-medium text-[var(--color-ink-display)]">
              {ins.headline}
            </span>
            <span className="text-sm text-[var(--color-ink-muted)]">
              {ins.text}
            </span>
          </li>
        ))}
      </ul>
    </PanelShell>
  );
}
