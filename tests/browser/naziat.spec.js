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

test("An-Nazi'at themes appear in the accordion and drive the daily plan", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [79]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–26");
  await expect(fajr).toContainText("v. 27–46");
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  await page.getByRole("button", { name: /An-Nazi/ }).click();
  const themes = page.getByRole("dialog");
  await expect(themes.locator(".theme-block")).toHaveCount(3);
  await expect(themes).toContainText(
    "Moussa et Pharaon : la rébellion et son châtiment",
  );
  await expect(themes).toContainText("27–46");
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const state = await stored(page);
  expect(state.cursor).toBe(0);
  expect(state.cycles).toBe(1);
  expect(state.day.results.fajr.passages.map((p) => p.segmentation)).toEqual([
    "naziat-v2",
    "naziat-v2",
  ]);
});
