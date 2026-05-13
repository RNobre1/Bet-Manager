import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PanelSkeleton } from "./skeleton";

/**
 * A single panel slot inside the StatsLayout grid.
 *
 * `node` is rendered behind a Suspense boundary so a slow Server panel
 * can stream in without blocking the rest of the page. `h` controls the
 * skeleton fallback height to keep CLS at zero.
 */
export interface PanelSlot {
  id: string;
  node: ReactNode;
  /** Skeleton placeholder height in px. */
  h?: number;
  /** Grid-column placement (e.g. "span 12 / span 12"). */
  colSpan?: string;
  /** A11y label for the fallback state. */
  label?: string;
}

interface StatsLayoutProps {
  fixtureId: number;
  hero: ReactNode;
  panels: PanelSlot[];
}

/**
 * Wrapper for the /fixtures/[id]/stats page.
 *
 * Top-to-bottom hierarchy:
 *  1. <header> with a back link to /fixtures/[id] (the AI analyze page).
 *  2. <section data-hero> — the Stadium Wall hero, full bleed.
 *  3. <section data-panels> — 12-column CSS grid for the panels.
 *     Each panel is wrapped in <Suspense> with a PanelSkeleton fallback.
 *
 * No client state lives here; everything is render-once Server-side.
 */
export function StatsLayout({ fixtureId, hero, panels }: StatsLayoutProps) {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 lg:px-8 lg:py-12">
      <header className="mb-6 flex items-center justify-between gap-2">
        <Link
          href={`/fixtures/${fixtureId}`}
          className="label inline-flex items-center gap-2 hover:text-[var(--color-ink)]"
        >
          ← análise IA
        </Link>
        <span className="label num text-[var(--color-ink-faint)]">
          stats / fixture #{fixtureId}
        </span>
      </header>

      <section data-hero className="mb-8">
        {hero}
      </section>

      <section
        data-panels
        className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6"
      >
        {panels.length === 0 ? (
          <p className="label col-span-full text-[var(--color-ink-faint)]">
            painéis em construção
          </p>
        ) : (
          panels.map((p) => (
            <Suspense
              key={p.id}
              fallback={
                <PanelSkeleton
                  h={p.h ?? 240}
                  colSpan={p.colSpan}
                  label={p.label}
                />
              }
            >
              <div
                data-panel={p.id}
                style={{ gridColumn: p.colSpan }}
                className="contents lg:block"
              >
                {p.node}
              </div>
            </Suspense>
          ))
        )}
      </section>
    </main>
  );
}
