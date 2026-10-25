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

test("Al-Mutaffifin themes appear in the accordion and drive the daily plan", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [83]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–28");
  await expect(fajr).toContainText("v. 29–36");
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  await page.getByRole("button", { name: /Al-Mutaffifin/ }).click();
  const themes = page.getByRole("dialog");
  await expect(themes.locator(".theme-block")).toHaveCount(3);
  await expect(themes).toContainText("Les moqueries des mécréants");
  await expect(themes).toContainText("29–36");
});
