/**
 * Panel E — 1H vs 2H splits.
 *
 * 6 horizontal CSS bars (no chart lib): goals/corners/cards × 1T/2T.
 * Each bar's width is proportional to the max across all 6 metrics, so the
 * tallest one sits at 100% and the others scale down. Empty/zero data
 * collapses gracefully (no division-by-zero — width = "0%").
 */

import type { Splits1h2h as SplitsData } from "@/lib/fixtures/stats/detail-json-types";

interface SplitsProps {
  data: SplitsData;
}

interface Row {
  label: string;
  half: "1T" | "2T";
  value: number;
}

function buildRows(d: SplitsData): Row[] {
  return [
    { label: "Gols", half: "1T", value: d.goals_1h_avg },
    { label: "Gols", half: "2T", value: d.goals_2h_avg },
    { label: "Cantos", half: "1T", value: d.corners_1h_avg },
    { label: "Cantos", half: "2T", value: d.corners_2h_avg },
    { label: "Cartões", half: "1T", value: d.cards_1h_avg },
    { label: "Cartões", half: "2T", value: d.cards_2h_avg },
  ];
}

export function Splits1h2h({ data }: SplitsProps) {
  const rows = buildRows(data);
  const max = rows.reduce((m, r) => (r.value > m ? r.value : m), 0);

  return (
    <div className="card flex flex-col gap-3 p-4 lg:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[var(--color-ink-display)]">
          1T vs 2T
        </h3>
        <span className="label text-[var(--color-ink-faint)]">médias</span>
      </header>

      <ul className="flex flex-col gap-2">
        {rows.map((r, idx) => {
          // Compact percent: 0 → "0%", 100 → "100%", 14.545 → "14.5%".
          // Stripping the trailing ".0" keeps tests honest and the DOM
          // smaller without changing visual result.
          const raw = max > 0 ? (r.value / max) * 100 : 0;
          const rounded = Math.round(raw * 10) / 10;
          const widthStr =
            Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
          return (
            <li
              key={idx}
              data-bar-row
              className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2 text-sm"
            >
              <span className="label text-[var(--color-ink-faint)]">
                {r.label} {r.half}
              </span>
              <span className="relative block h-3 overflow-hidden rounded-sm bg-[var(--color-surface-2)]">
                <span
                  data-bar-fill
                  className="block h-full rounded-sm"
                  style={{
                    width: widthStr,
                    backgroundColor: "var(--color-vermelho)",
                  }}
                />
              </span>
              <span className="num text-right text-[var(--color-ink-display)]">
                {r.value.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
