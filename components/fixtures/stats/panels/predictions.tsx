/**
 * Panel J — choistats predictions (OPTIONAL).
 *
 * choistats supplies `predictions[]` for ~11% of fixtures, ordered as-is.
 * We sort by `chance` DESC so the highest-confidence pick floats to the top.
 * Returns `null` when the array is empty (no placeholder; the slot
 * disappears upstream).
 */

import type { Prediction } from "@/lib/fixtures/stats/detail-json-types";

interface PredictionsProps {
  data: Prediction[];
}

export function Predictions({ data }: PredictionsProps) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const sorted = [...data].sort((a, b) => b.chance - a.chance);

  return (
    <div className="card flex flex-col gap-3 p-4 lg:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[var(--color-ink-display)]">
          Predictions
        </h3>
        <span className="label text-[var(--color-ink-faint)]">choistats</span>
      </header>

      <ul className="flex flex-col gap-3">
        {sorted.map((p, idx) => (
          <li
            key={`${p.stat_type}-${idx}`}
            data-prediction
            className="flex flex-col gap-2 rounded-md bg-[var(--color-surface-2)] p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-sm font-medium"
                style={{
                  backgroundColor: "var(--color-vermelho)",
                  color: "var(--color-ink-display)",
                }}
              >
                {Math.round(p.chance)}% {p.stat_type}
              </span>
              {p.best_odds !== null ? (
                <span className="num text-sm text-[var(--color-ink-display)]">
                  {p.best_odds.toFixed(2)}
                  {p.best_odds_bookmaker ? (
                    <span className="label ml-1 text-[var(--color-ink-faint)]">
                      {p.best_odds_bookmaker}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>

            {p.home_stats.length > 0 || p.away_stats.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                {p.home_stats.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {p.home_stats.map((s, i) => (
                      <li key={i} className="text-[var(--color-ink-muted)]">
                        • {s}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {p.away_stats.length > 0 ? (
                  <ul className="flex flex-col gap-0.5">
                    {p.away_stats.map((s, i) => (
                      <li key={i} className="text-[var(--color-ink-muted)]">
                        • {s}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
