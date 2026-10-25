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

test("Al-Infitar themes appear in the accordion and the surah chains whole", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [82]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–19");
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  await page.getByRole("button", { name: /Al-Infitar/ }).click();
  const themes = page.getByRole("dialog");
  await expect(themes.locator(".theme-block")).toHaveCount(3);
  await expect(themes).toContainText("L’insouciance de l’homme");
  await expect(themes).toContainText("13–19");
});
