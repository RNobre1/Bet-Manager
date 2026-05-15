import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * E2E for the stats-first fixture copilot.
 *
 * Frozen intent (3 behaviors):
 *   1. opening a game lands on the dashboard, NOT the chat;
 *   2. the FAB opens the copilot drawer (role=dialog) with 0 axe
 *      violations scoped to the dialog;
 *   3. the legacy /fixtures/[id]/stats route redirects to /fixtures/[id].
 *
 * Discovery strategy mirrors `stats-page.spec.ts`: the dev DB rolls a
 * 3-4 day retention window, so instead of clicking a list link (whose
 * markup is content-dependent) we hit `/api/fixtures?date=today` (then
 * `?date=tomorrow`) and pick the first row with non-null `detail_json`.
 * That guarantees the dashboard has data to render. If none is found
 * (empty/unauthenticated dev DB) the test is `skip`-ed — the same
 * acknowledged DB-state dependency the existing specs carry.
 */
async function pickFixtureWithDetail(
  page: Page,
): Promise<{ id: number } | null> {
  for (const date of ["today", "tomorrow"]) {
    const resp = await page.request.get(`/api/fixtures?date=${date}`);
    if (!resp.ok()) continue;
    // The dashboard is auth-gated by middleware → unauthenticated requests
    // are redirected to /login (HTML response). Bail out cleanly so the
    // test reports skip instead of a JSON parse crash.
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

test.describe("fixture copilot · stats-first", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("abrir um jogo cai no dashboard, não no chat", async ({ page }) => {
    const fixture = await pickFixtureWithDetail(page);
    test.skip(
      !fixture,
      "no fixture with non-null detail_json found in dev DB — seed one to exercise this path",
    );

    await page.goto(`/fixtures/${fixture!.id}`);

    // Landing on the dashboard means the URL stays on /fixtures/[id]
    // (no /stats, no /chat) and the copilot FAB is mounted closed.
    await expect(page).toHaveURL(new RegExp(`/fixtures/${fixture!.id}/?$`));
    await expect(page).not.toHaveURL(/\/stats(\/|$)/);
    await expect(page).not.toHaveURL(/\/chat(\/|$)/);
    await expect(page.getByLabel("Abrir copilot do jogo")).toBeVisible();
  });

  test("o FAB abre o drawer; sem violações axe no diálogo", async ({
    page,
  }) => {
    const fixture = await pickFixtureWithDetail(page);
    test.skip(
      !fixture,
      "no fixture with non-null detail_json found in dev DB — seed one to exercise this path",
    );

    await page.goto(`/fixtures/${fixture!.id}`);
    await page.getByLabel("Abrir copilot do jogo").click();
    await expect(page.getByRole("dialog")).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
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

  test("/fixtures/[id]/stats redireciona para /fixtures/[id]", async ({
    page,
  }) => {
    const fixture = await pickFixtureWithDetail(page);
    test.skip(
      !fixture,
      "no fixture with non-null detail_json found in dev DB — seed one to exercise this path",
    );

    await page.goto(`/fixtures/${fixture!.id}/stats`);
    await expect(page).toHaveURL(
      new RegExp(`/fixtures/${fixture!.id}/?$`),
    );
    await expect(page).not.toHaveURL(/\/stats(\/|$)/);
  });
});
