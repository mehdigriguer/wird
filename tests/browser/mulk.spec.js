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

test("Al-Mulk themes appear on the Découpage tab and drive the daily plan", async ({
  page,
}, testInfo) => {
  await seed(page, updateKnown(fullState(localDate()), [67]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–14");
  await expect(fajr).toContainText("v. 15–30");
  await expect(fajr).toContainText(
    "La souveraineté d’Allah, la création et l’épreuve de la vie",
  );
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  await page.getByRole("button", { name: /Al-Mulk/ }).click();
  const themes = page.getByRole("dialog");
  await expect(themes.locator(".theme-block")).toHaveCount(3);
  await expect(
    themes.getByText("La dépendance des hommes envers Allah", { exact: false }),
  ).toBeVisible();
  await expect(themes).toContainText("Ibn Kathir (Quran.com)");
  await page.screenshot({ path: testInfo.outputPath("mulk-sections.png") });
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const state = await stored(page);
  // toute la sourate est récitée d'un coup : le cycle se termine
  expect(state.cursor).toBe(0);
  expect(state.cycles).toBe(1);
  expect(state.day.results.fajr.passages.map((p) => p.segmentation)).toEqual([
    "mulk-v2",
    "mulk-v2",
  ]);
});

test("verses 20–30 fit one morning rakaat at the 1-page default", async ({
  page,
}) => {
  await seed(
    page,
    updateKnown(fullState(localDate()), [67], { 67: { from: 20, to: 30 } }),
  );
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 20–30");
  await expect(fajr).toContainText("La dépendance des hommes envers Allah");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const after = await stored(page);
  expect(after.cycles).toBe(2);
  const covered = after.history
    .flatMap((e) => e.passages)
    .filter((p) => p && !p.blocked && p.cycle === 1)
    .flatMap((p) =>
      Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i),
    );
  expect(covered).toEqual(Array.from({ length: 11 }, (_, i) => 20 + i));
  for (const p of after.history.flatMap((e) => e.passages)) {
    if (!p || p.blocked) continue;
    const inTheme = p.from >= 15 && p.to <= 30;
    expect(inTheme).toBe(true);
  }
});
