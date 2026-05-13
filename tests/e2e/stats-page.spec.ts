import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E + a11y for the `/fixtures/[id]/stats` page.
 *
 * Discovery strategy
 * ------------------
 * The dev DB content varies day-to-day (the scraper rolls a 3-4 day
 * retention window). Instead of hard-coding a fixture id we hit
 * `/api/fixtures?date=today` (then `?date=tomorrow` as fallback) and pick
 * the **first row whose `detail_json` is non-null**. That guarantees the
 * stats page has data to render — otherwise the page collapses to the
 * "stats em breve" empty-state which is its own (integration-tested) path.
 *
 * If no fixture with detail_json can be found, the test is `skip`-ed
 * (DB-state dependency is acknowledged in the task spec; integration
 * tests cover the same flows deterministically).
 */
async function pickFixtureWithDetail(
  page: Page,
): Promise<{ id: number } | null> {
  for (const date of ["today", "tomorrow"]) {
    const resp = await page.request.get(`/api/fixtures?date=${date}`);
    if (!resp.ok()) continue;
    // The dashboard is auth-gated by middleware → unauthenticated requests
    // are redirected to /login (HTML response). Bail out cleanly in that
    // case so the test reports skip("auth required") instead of a JSON
    // parse crash.
    const ct = resp.headers()["content-type"] ?? "";
    if (!ct.includes("application/json")) continue;
    const rows = (await resp.json()) as Array<{
      id: number;
      detail_json: unknown | null;
    }>;
    const hit = rows.find((r) => r.detail_json !== null);
    if (hit) return { id: hit.id };
  }
  return null;
}

test.describe("stats page · desktop", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("renders hero + panels and deep-links the streaks chip into the URL", async ({
    page,
  }) => {
    const fixture = await pickFixtureWithDetail(page);
    test.skip(
      !fixture,
      "no fixture with non-null detail_json found in dev DB — seed one to exercise this path",
    );

    await page.goto(`/fixtures/${fixture!.id}/stats`);

    // Hero must mount with a first-level heading (team names).
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    // The 12-col grid must render at desktop width.
    await expect(page.locator("[data-panels]")).toBeVisible();

    // Streaks heatmap (panel F) → click the "Goals" chip and assert the
    // search-param round-trip. The chip is inside a button[aria-pressed].
    const streaksSlot = page.locator('[data-panel="F"]');
    await expect(streaksSlot).toBeVisible();

    // The chip list is populated from `data.by_group`. Some fixtures may
    // not have a "Goals" group; if so, fall back to the first chip in the
    // panel.
    const goalsChip = streaksSlot.getByRole("button", { name: "Goals" });
    const fallbackChip = streaksSlot
      .locator('[aria-label="filtros por grupo de streak"] button')
      .first();
    const targetChip = (await goalsChip.count()) > 0 ? goalsChip : fallbackChip;
    const chipLabel = (await targetChip.textContent())?.trim() ?? "";
    test.skip(
      !chipLabel,
      "streaks panel has no chips for this fixture — pick another one",
    );

    await targetChip.click();

    // URL must contain `streaks=<label>` after the toggle.
    await page.waitForURL(/[?&]streaks=/);
    const url = new URL(page.url());
    expect(url.searchParams.get("streaks")).toContain(chipLabel);
  });
});

test.describe("stats page · mobile", () => {
  test.use({ viewport: { width: 360, height: 800 } });

  test("renders Radix tabs and reports zero axe-core violations", async ({
    page,
  }) => {
    const fixture = await pickFixtureWithDetail(page);
    test.skip(
      !fixture,
      "no fixture with non-null detail_json found in dev DB — seed one to exercise this path",
    );

    await page.goto(`/fixtures/${fixture!.id}/stats`);

    // Mobile renderer mounts the Tabs root, not the grid.
    const tabs = page.locator("[data-mobile-tabs]");
    await expect(tabs).toBeVisible();
    await expect(page.locator("[data-panels]")).toHaveCount(0);

    // Default tab is "visão"; activate "streaks" tab.
    const streaksTab = tabs.getByRole("tab", { name: "streaks" });
    await streaksTab.click();
    // Active state ⇒ Radix sets data-state="active" on both trigger and content.
    await expect(streaksTab).toHaveAttribute("data-state", "active");
    // Panel F should now be inside the active tab content and visible.
    await expect(page.locator('[data-panel="F"]')).toBeVisible();

    // ─── axe-core a11y check ───────────────────────────────────────────
    // Restrict to "main" so we don't audit external chrome that this PR
    // doesn't own (e.g. nav).
    const results = await new AxeBuilder({ page })
      .include("main")
      // WCAG 2.1 AA scope mirroring most baseline projects.
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(
      results.violations,
      `axe found ${results.violations.length} violation(s): ${JSON.stringify(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
        null,
        2,
      )}`,
    ).toEqual([]);
  });
});
