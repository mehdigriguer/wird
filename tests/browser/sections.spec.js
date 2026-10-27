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

test("Al-Kahf shows its themes and whole source-backed morning passages", async ({
  page,
}, testInfo) => {
  await seed(page, updateKnown(fullState(localDate()), [18]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–8");
  await expect(fajr).toContainText("la fermeté dans la foi");
  await expect(fajr).toContainText("Le Coran et l’épreuve");
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  await expect(page.locator(".nav-item.selected")).toContainText("Découpage");
  await expect(page.locator(".surah-card")).toHaveCount(114);
  await expect(page.locator(".surah-card.greyed").first()).toBeDisabled();
  const kahfCard = page.getByRole("button", { name: /Al-Kahf/ });
  await kahfCard.click();
  await expect(page.getByRole("dialog")).toContainText("Al-Kahf");
  const themes = page.getByRole("dialog");
  await expect(themes.locator(".theme-block")).toHaveCount(8);
  await expect(themes.locator(".theme-block").nth(5)).toContainText(
    "Moussa et Al-Khidr",
  );
  await expect(themes.locator(".theme-block").nth(5)).toContainText("60–82");
  await expect(themes.locator(".theme-portions")).toHaveCount(0);
  await expect(themes).toContainText("CC BY-NC 3.0");
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("kahf-sections.png") });
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const state = await stored(page);
  expect(state.cursor).toBe(16);
  expect(state.day.results.fajr.passages.map((p) => p.segmentation)).toEqual([
    "kahf-v1",
    "kahf-v1",
  ]);
  await page.reload();
  await expect(page.locator(".prayer-card.active")).toContainText(
    "la fermeté dans la foi",
  );
});

test("a theme ends before the next even with room, and small caps fill inside the theme", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [18]));
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page
    .getByRole("group", { name: "Plafond Fajr" })
    .getByRole("button", { name: "¼ page" })
    .click();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("Le Coran et l’épreuve");
  await expect(fajr).not.toContainText("la fermeté dans la foi");
  for (let i = 0; i < 8; i++) {
    await page
      .getByRole("button", { name: "J’ai prié avec ces versets" })
      .click();
  }
  const after = await stored(page);
  expect(after.history.length).toBe(8);
  expect(after.cursor).toBeGreaterThan(0);
  const themes = [
    [1, 8],
    [9, 26],
    [27, 31],
    [32, 44],
    [45, 59],
    [60, 82],
    [83, 98],
    [99, 110],
  ];
  for (const p of after.history.flatMap((e) => e.passages)) {
    if (!p || p.blocked) continue;
    expect(themes.some(([from, to]) => p.from >= from && p.to <= to)).toBe(
      true,
    );
  }
});

test("a learned range ending mid-theme stops at the learned verse without extending it", async ({
  page,
}) => {
  await seed(
    page,
    updateKnown(fullState(localDate()), [18], { 18: { from: 1, to: 3 } }),
  );
  await expect(page.locator(".warning")).toHaveCount(0);
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–3");
  await expect(fajr).not.toContainText("v. 1–4");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  expect((await stored(page)).cycles).toBe(1);
});

test("a range starting mid-theme simply starts at that verse", async ({
  page,
}) => {
  await seed(
    page,
    updateKnown(fullState(localDate()), [18], { 18: { from: 3, to: 8 } }),
  );
  await expect(page.locator(".warning")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Recommencer le tour" }),
  ).toHaveCount(0);
  await expect(page.locator(".prayer-card").first()).toContainText("v. 3–8");
});

test("a legacy mid-theme cursor simply resumes at that verse", async ({
  page,
}) => {
  const state = updateKnown(fullState(localDate()), [18]);
  state.cursor = 3;
  state.cycles = 2;
  const passage = {
    surah: 18,
    from: 1,
    to: 3,
    page: 293,
    endPage: 293,
    size: 0.25,
    cycle: 3,
  };
  state.day.results = { fajr: { status: "done", passages: [passage] } };
  state.history = [
    {
      ...state.day.results.fajr,
      date: state.day.date,
      prayerId: "fajr",
      name: "Fajr",
      epoch: state.epoch,
      beforeCursor: 0,
      beforeCycles: 2,
    },
  ];
  await seed(page, state);
  await expect(page.locator(".prayer-card").first()).toContainText(
    "Ancien découpage, repères non appliqués",
  );
  await expect(page.locator(".warning")).toHaveCount(0);
  await expect(page.locator(".prayer-card.active")).toContainText("v. 4");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const after = await stored(page);
  expect(after.cycles).toBe(2);
  expect(after.history.length).toBe(2);
});

test("coverage is explicit and unsupported surahs keep their existing behavior", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [112, 113, 114]));
  await expect(page.locator(".prayer-card").first()).toContainText("Al-Ikhlas");
  await page.getByRole("button", { name: "Découpage", exact: true }).click();
  const baqarah = page.getByRole("button", { name: /Al-Baqarah/ });
  await expect(baqarah).toBeDisabled();
});
