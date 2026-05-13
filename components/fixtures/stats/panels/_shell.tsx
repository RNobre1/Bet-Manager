/**
 * Shared shell for the Server panels in `components/fixtures/stats/panels/`.
 *
 * Every panel (A, D, E, I, J, M, N) opens with the same header pattern:
 *   <div class="card flex flex-col gap-N p-4 lg:p-5">
 *     <header>
 *       <h3 class="font-display text-lg ...">{title}</h3>
 *       <span class="label ...">{eyebrow}</span>
 *     </header>
 *     ...body...
 *
 * Extracted in the T4 refactor pass to remove the duplication. The wrapper
 * is intentionally tiny — no state, no Suspense (StatsLayout already wraps
 * each slot in its own Suspense boundary).
 *
 * `gap` is configurable because two panels (team-record, h2h) use gap-4,
 * three (splits, referee, insights) use gap-3, and predictions/distributions
 * use gap-3 or gap-4 depending on the body density.
 */

import type { ReactNode } from "react";

interface PanelShellProps {
  title: string;
  /** Optional small text on the right (e.g. "geral", "choistats", count). */
  eyebrow?: ReactNode;
  /** Vertical spacing between header and body. 3 or 4 (tailwind units). */
  gap?: 3 | 4;
  children: ReactNode;
}

export function PanelShell({
  title,
  eyebrow,
  gap = 3,
  children,
}: PanelShellProps) {
  const gapClass = gap === 4 ? "gap-4" : "gap-3";
  return (
    <div className={`card flex flex-col ${gapClass} p-4 lg:p-5`}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg text-[var(--color-ink-display)]">
          {title}
        </h3>
        {eyebrow !== undefined && eyebrow !== null ? (
          <span className="label text-[var(--color-ink-faint)]">{eyebrow}</span>
        ) : null}
      </header>
      {children}
    </div>
  );
}
