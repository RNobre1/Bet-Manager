"use client";

/**
 * Responsive renderer for the stats panel grid.
 *
 * - Desktop (≥768px): 12-column CSS grid; every panel mounted once.
 * - Mobile (<768px): Radix `<Tabs.Root>` with 5 tabs. Each tab content
 *   mounts only its declared panels — Radix unmounts inactive content
 *   by default, which is a real perf win on phones (lightweight-charts,
 *   recharts, and the virtualized streaks list only construct when the
 *   tab is active).
 *
 * Viewport detection uses `useSyncExternalStore` + `window.matchMedia`
 * so SSR markup matches the initial client render (desktop), avoiding
 * hydration drift. The first matchMedia subscription tick swaps to the
 * mobile structure if the viewport is actually narrow.
 *
 * `MOBILE_TABS` (declared in `stats-layout.tsx`) is the single source
 * of truth for tab → panel-id mapping. Panels declared by `page.tsx`
 * but absent from MOBILE_TABS fall back to the "visão" tab.
 */

import * as Tabs from "@radix-ui/react-tabs";
import { useSyncExternalStore } from "react";
import {
  MOBILE_TABS,
  renderPanelSlot,
  type PanelSlot,
} from "./stats-layout";

const MOBILE_QUERY = "(max-width: 767.98px)";

// ─── matchMedia hook ────────────────────────────────────────────────────

function subscribe(query: string) {
  return (cb: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mql = window.matchMedia(query);
    // Newer browsers expose addEventListener; legacy Safari uses addListener.
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    }
    const legacy = mql as unknown as {
      addListener?: (cb: () => void) => void;
      removeListener?: (cb: () => void) => void;
    };
    legacy.addListener?.(cb);
    return () => legacy.removeListener?.(cb);
  };
}

function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe(MOBILE_QUERY),
    () => {
      if (typeof window === "undefined") return false;
      return window.matchMedia(MOBILE_QUERY).matches;
    },
    // Server snapshot: assume desktop. The grid SSRs; if the real viewport
    // is mobile, the first client tick will swap to tabs. Acceptable for
    // a CSR-heavy stats page.
    () => false,
  );
}

// ─── Component ──────────────────────────────────────────────────────────

interface StatsLayoutResponsiveProps {
  panels: PanelSlot[];
}

export function StatsLayoutResponsive({
  panels,
}: StatsLayoutResponsiveProps) {
  const isMobile = useIsMobile();

  if (panels.length === 0) {
    return (
      <section
        data-panels-empty
        className="@container/main rounded-[var(--radius)] border border-[var(--color-line-subtle)] bg-[var(--color-surface-1)] p-6"
      >
        <p className="label text-[var(--color-ink-faint)]">
          painéis em construção
        </p>
      </section>
    );
  }

  if (!isMobile) {
    return (
      <section
        data-panels
        className="@container/main grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6"
      >
        {panels.map((p) => renderPanelSlot(p, false))}
      </section>
    );
  }

  // ─── Mobile tabs ──────────────────────────────────────────────────────
  const byId = new Map<string, PanelSlot>();
  for (const p of panels) byId.set(p.id, p);

  // Track which panel ids are already accounted for by a tab.
  const claimedIds = new Set<string>(MOBILE_TABS.flatMap((t) => t.panels));
  // Unclaimed panels fall into "visão" so nothing disappears on mobile.
  const orphanIds = panels
    .map((p) => p.id)
    .filter((id) => !claimedIds.has(id));

  return (
    <Tabs.Root
      defaultValue={MOBILE_TABS[0].id}
      className="@container/main flex flex-col gap-4"
      data-mobile-tabs
    >
      <Tabs.List
        className="flex w-full snap-x snap-mandatory gap-1 overflow-x-auto rounded-[var(--radius)] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="seções da fixture"
      >
        {MOBILE_TABS.map((tab) => (
          <Tabs.Trigger
            key={tab.id}
            value={tab.id}
            className="label shrink-0 snap-start rounded-[var(--radius-sm)] px-3 py-2 text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)] data-[state=active]:bg-[var(--color-vermelho)] data-[state=active]:text-[var(--color-ink-display)]"
          >
            {tab.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>

      {MOBILE_TABS.map((tab) => {
        const ids = tab.id === MOBILE_TABS[0].id
          ? [...tab.panels, ...orphanIds]
          : tab.panels;
        const tabPanels = ids
          .map((id) => byId.get(id))
          .filter((p): p is PanelSlot => Boolean(p));
        return (
          <Tabs.Content
            key={tab.id}
            value={tab.id}
            className="flex flex-col gap-4 focus-visible:outline-none"
          >
            {tabPanels.map((p) => renderPanelSlot(p, true))}
          </Tabs.Content>
        );
      })}
    </Tabs.Root>
  );
}
