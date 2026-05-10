import { test, expect } from "@playwright/test";

test("landing renders the Abissal hero with brand identity", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Abissal · gestão de banca")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("banca");
  await expect(page.getByText("habitada.")).toBeVisible();
});
