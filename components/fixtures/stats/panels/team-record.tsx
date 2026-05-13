/**
 * Panel A — Team record (per-side seasonal split + overall comparison).
 *
 * Render-only Server Component. The derivers in `lib/fixtures/stats/derive.ts`
 * have already done the upstream work: the ordinal is parsed, the form array
 * is reverted newest-first, and the `overall` leg is filled with a defensive
 * fallback when only one side is present in the source payload.
 *
 * Behaviour:
 *   - returns `null` if `data === null` (T-side requirement)
 *   - hides the splits comparison row when `split` and `overall` are
 *     identical (small leagues / mid-season Home-only feeds)
 */

import { FormBar, type FormResult } from "@/components/charts/form-bar";
import type {
  TeamRecordDerived,
  TeamSplitDerived,
} from "@/lib/fixtures/stats/detail-json-types";

interface TeamRecordProps {
  teamName: string;
  data: TeamRecordDerived | null;
}

function formatGoalDiff(gd: number): string {
  return gd > 0 ? `+${gd}` : `${gd}`;
}

function isSameSplit(a: TeamSplitDerived, b: TeamSplitDerived): boolean {
  return (
    a.played === b.played &&
    a.won === b.won &&
    a.draw === b.draw &&
    a.lost === b.lost &&
    a.goals_for === b.goals_for &&
    a.goals_against === b.goals_against &&
    a.points === b.points
  );
}

function castForm(form: string[]): FormResult[] {
  const out: FormResult[] = [];
  for (const f of form) {
    if (f === "W" || f === "D" || f === "L") out.push(f);
  }
  return out;
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label text-[var(--color-ink-faint)]">{label}</span>
      <span className="num text-xl text-[var(--color-ink-display)]">{value}</span>
    </div>
  );
}

export function TeamRecord({ teamName, data }: TeamRecordProps) {
  if (data === null) return null;

  const { split, overall } = data;
  const showComparison = !isSameSplit(split, overall);

  return (
    <div className="card flex flex-col gap-4 p-4 lg:p-5">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[var(--color-ink-display)]">
          {teamName}
        </h3>
        <span className="label text-[var(--color-ink-faint)]">
          {split.type === "All" ? "geral" : split.type === "Home" ? "casa" : split.type === "Away" ? "fora" : split.type}
        </span>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCell label="pontos" value={String(split.points)} />
        <MetricCell label="PPG" value={split.points_per_game.toFixed(2)} />
        <MetricCell
          label="posição"
          value={split.position !== null ? String(split.position) : "—"}
        />
        <MetricCell label="GD" value={formatGoalDiff(split.goal_diff)} />
      </div>

      <div className="flex items-center gap-3">
        <span className="label text-[var(--color-ink-faint)]">forma</span>
        <FormBar results={castForm(split.form)} />
      </div>

      {showComparison ? (
        <div
          data-splits-comparison
          className="flex flex-col gap-1 rounded-md bg-[var(--color-surface-2)] p-3 text-sm"
        >
          <span className="label text-[var(--color-ink-faint)]">
            vs geral
          </span>
          <div className="grid grid-cols-3 gap-2 text-[var(--color-ink-display)]">
            <span className="num">PPG {overall.points_per_game.toFixed(2)}</span>
            <span className="num">GF {overall.goals_for}</span>
            <span className="num">GA {overall.goals_against}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
