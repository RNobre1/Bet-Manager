import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { FixtureRow } from "@/lib/fixtures/types";

/**
 * Smaller sibling of `stats-page.test.tsx` focused on the **empty
 * fixture** path: `detail_json === null`.
 *
 * Contract under test:
 *  - Hero still renders (teams + kickoff visible).
 *  - "stats em breve — scraper atualiza diariamente" fallback message
 *    replaces the KPI grid.
 *  - No data-panel slot is mounted (page.tsx returns an empty
 *    `panels` array, so the responsive layout shows the
 *    "painéis em construção" empty-state instead).
 */

// lightweight-charts touches canvas/WebGL — not implemented by happy-dom.
// Even though the empty-state path doesn't render MomentumChart, the
// component module is statically imported by page.tsx and would crash on
// first evaluation without the mock.
vi.mock("lightweight-charts", () => ({
  createChart: vi.fn(() => ({
    addLineSeries: vi.fn(() => ({ setData: vi.fn() })),
    remove: vi.fn(),
    applyOptions: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
  })),
}));

type MockState = {
  row: FixtureRow | null;
  error: { message: string } | null;
};

const mockState: MockState = { row: null, error: null };

function setRow(row: FixtureRow | null) {
  mockState.row = row;
  mockState.error = null;
}

function buildQueryBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.maybeSingle = () =>
    Promise.resolve(
      mockState.error
        ? { data: null, error: mockState.error }
        : { data: mockState.row, error: null },
    );
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => buildQueryBuilder(),
  }),
}));

class NotFoundError extends Error {
  digest = "NEXT_NOT_FOUND";
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFoundError();
  },
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: () => {}, push: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));

// AFTER mocks.
import StatsPage from "@/app/(dashboard)/fixtures/[id]/stats/page";

const SAMPLE_KICKOFF = "2026-05-12T19:00:00+00:00"; // 16:00 BRT

function makeEmptyRow(): FixtureRow {
  return {
    id: 7,
    match_date: "2026-05-12",
    ko_time: "20:00:00",
    home_team: "Botafogo",
    away_team: "Vasco",
    league: "Série A",
    country: "brazil",
    source_url: "https://www.adamchoi.co.uk/fixture/7",
    detail_json: null,
    kickoff_utc: SAMPLE_KICKOFF,
  };
}

async function renderPage(rawId: string) {
  const element = await StatsPage({ params: Promise.resolve({ id: rawId }) });
  return render(element);
}

beforeEach(() => {
  setRow(null);
});

describe("StatsPage empty-state (detail_json === null)", () => {
  it("renders the hero with the 'stats em breve' fallback when detail_json is null", async () => {
    setRow(makeEmptyRow());

    await renderPage("7");

    // Hero is still mounted — team names visible.
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("Botafogo");
    expect(heading.textContent).toContain("Vasco");

    // The fallback paragraph replaces the KPI grid.
    expect(screen.getByText(/stats em breve/i)).toBeDefined();
  });

  it("shows the 'painéis em construção' placeholder when there are no panels to render", async () => {
    setRow(makeEmptyRow());

    const { container } = await renderPage("7");

    // page.tsx returns panels=[] when detail is null →
    // StatsLayoutResponsive renders the empty-state section.
    expect(container.querySelector("[data-panels-empty]")).not.toBeNull();
    // And no panel slot mounted.
    expect(container.querySelectorAll("[data-panel]").length).toBe(0);
    expect(screen.getByText(/painéis em construção/i)).toBeDefined();
  });

  it("does not render any KPI tiles (no odds tile values) when detail_json is null", async () => {
    setRow(makeEmptyRow());

    await renderPage("7");

    // Hero KPI tile labels (1, X, 2, Over 2.5, BTTS Yes, Ref BP) only
    // render when `kpis` is non-null. With detail_json null, the bundle
    // is null and the fallback paragraph shows instead.
    expect(screen.queryByText("Over 2.5")).toBeNull();
    expect(screen.queryByText("BTTS Yes")).toBeNull();
    expect(screen.queryByText("Ref BP")).toBeNull();
  });
});
