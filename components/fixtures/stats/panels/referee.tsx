/**
 * Panel I — Referee record (OPTIONAL).
 *
 * Returns `null` when `record` is null. choistats only populates the field
 * once the appointed referee has been disclosed (≈4% of fixtures), so this
 * panel disappears for the rest — by design, no placeholder.
 *
 * Visual cue: when avg total booking points > 45, the headline glows in
 * `--color-vermelho`. The 45 threshold matches the heuristic used in the
 * insights engine (`REF_BP_HIGH`).
 */

import type { RefereeRecord } from "@/lib/fixtures/stats/detail-json-types";

interface RefereeProps {
  record: RefereeRecord | null;
}

const BP_THRESHOLD = 45;

export function Referee({ record }: RefereeProps) {
  if (record === null) return null;

  const isHigh = record.avg_total_booking_points > BP_THRESHOLD;
  const headlineColor = isHigh
    ? "var(--color-vermelho)"
    : "var(--color-ink-display)";

  return (
    <div className="card flex flex-col gap-3 p-4 lg:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[var(--color-ink-display)]">
          {record.name}
        </h3>
        <span className="label text-[var(--color-ink-faint)]">árbitro</span>
      </header>

      <div className="flex items-baseline gap-3">
        <span
          data-bp-headline
          className="font-display num text-4xl"
          style={{ color: headlineColor }}
        >
          {record.avg_total_booking_points.toFixed(1)}
        </span>
        <span className="label text-[var(--color-ink-faint)]">
          BP médio por jogo
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="flex flex-col">
          <span className="label text-[var(--color-ink-faint)]">casa</span>
          <span className="num text-[var(--color-ink-display)]">
            {record.avg_home_booking_points.toFixed(1)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="label text-[var(--color-ink-faint)]">fora</span>
          <span className="num text-[var(--color-ink-display)]">
            {record.avg_away_booking_points.toFixed(1)}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="label text-[var(--color-ink-faint)]">2º amarelo</span>
          <span className="num text-[var(--color-ink-display)]">
            {record.total_yellow_reds}
          </span>
        </div>
      </div>
    </div>
  );
}
