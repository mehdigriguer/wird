import { test, expect } from "@playwright/test";
import { localDate, updateKnown } from "../../src/planner.js";
import { fullState } from "../helpers.js";

const key = "wird.progress.v1";
async function seed(page, state) {
  await page.goto("/");
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key, state },
  );
  await page.reload();
}

test("sort toggle reverses the grid on memorisation, découpage has none", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [18]));
  await page.getByRole("button", { name: "Mémorisation", exact: true }).click();
  await expect(page.locator(".surah-card").first()).toContainText("Al-Fatihah");
  await page.getByRole("button", { name: /Ordre/ }).click();
  await expect(page.locator(".surah-card").first()).toContainText("An-Nas");
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  await expect(page.locator(".surah-card").first()).toContainText("An-Nas");
  await expect(page.getByRole("button", { name: /Ordre/ })).toHaveCount(0);
});

test("memory filter shows only the matching surahs", async ({ page }) => {
  await seed(
    page,
    updateKnown(fullState(localDate()), [1, 2, 18], {
      2: { from: 1, to: 40 },
    }),
  );
  await page.getByRole("button", { name: "Mémorisation", exact: true }).click();
  const filter = page.getByRole("group", { name: "Filtrer les sourates" });
  await filter.getByRole("button", { name: "Entières" }).click();
  await expect(page.locator(".surah-card")).toHaveCount(2);
  await expect(page.locator(".surah-card").first()).toContainText("Al-Fatihah");
  await filter.getByRole("button", { name: "En cours" }).click();
  await expect(page.locator(".surah-card")).toHaveCount(1);
  await expect(page.locator(".surah-card").first()).toContainText("Al-Baqarah");
  await filter.getByRole("button", { name: "Pas apprises" }).click();
  await expect(page.locator(".surah-card")).toHaveCount(111);
  await filter.getByRole("button", { name: "Toutes" }).click();
  await expect(page.locator(".surah-card")).toHaveCount(114);
});
