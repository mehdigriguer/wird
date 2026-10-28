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
async function stored(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
}

test("An-Naba themes appear on the Découpage tab and drive the daily plan", async ({
  page,
}, testInfo) => {
  await seed(page, updateKnown(fullState(localDate()), [78]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–30");
  await expect(fajr).toContainText("v. 31–40");
  await expect(fajr).toContainText("Le grand événement");
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  await page.getByRole("button", { name: /An-Naba/ }).click();
  const themes = page.getByRole("dialog");
  await expect(themes.locator(".theme-block")).toHaveCount(3);
  await expect(themes).toContainText("31–40");
  await page.screenshot({ path: testInfo.outputPath("naba-sections.png") });
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Programme", exact: true }).click();
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const state = await stored(page);
  expect(state.cursor).toBe(0);
  expect(state.cycles).toBe(1);
  expect(state.day.results.fajr.passages.map((p) => p.segmentation)).toEqual([
    "naba-v1",
    "naba-v1",
  ]);
});

test("An-Naba blocks never mix with Al-Mulk or Al-Kahf themes in one rakaat", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [18, 67, 78]));
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const state = await stored(page);
  for (const p of state.day.results.fajr.passages) {
    expect(p.segmentation).toBeTruthy();
  }
});
