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

test("extend a rakaat to finish the theme, the cycle follows", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [18]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 9–16");
  await page.getByRole("textbox", { name: "Fin rakaat 2" }).fill("26");
  await expect(fajr).toContainText("v. 9–26");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const state = await stored(page);
  expect(state.cursor).toBe(26);
  expect(state.day.results.fajr.passages[1].overridden).toBe(true);
  await page.reload();
  await expect(page.locator(".prayer-card.active")).toContainText(
    "Rappel et récompense",
  );
  await expect(page.locator(".prayer-card.active")).toContainText("v. 27");
});

test("shorten a rakaat replans the following one", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [18]));
  const fajr = page.locator(".prayer-card").first();
  await expect(fajr).toContainText("v. 1–8");
  await page.getByRole("textbox", { name: "Fin rakaat 1" }).fill("4");
  await expect(fajr).toContainText("v. 1–4");
  await expect(fajr).toContainText("v. 5–8");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  expect((await stored(page)).cursor).toBe(8);
  expect((await stored(page)).day.results.fajr.passages[0].overridden).toBe(
    true,
  );
});

test("override choices never exceed the theme end or the learned verses", async ({
  page,
}) => {
  await seed(
    page,
    updateKnown(fullState(localDate()), [18], { 18: { from: 1, to: 20 } }),
  );
  await expect(
    page.getByRole("textbox", { name: "Fin rakaat 2" }),
  ).toHaveAttribute("min", "9");
  await expect(
    page.getByRole("textbox", { name: "Fin rakaat 2" }),
  ).toHaveAttribute("max", "20");
  await expect(page.getByLabel("Augmenter fin rakaat 2")).not.toBeDisabled();
  await page.getByLabel("Augmenter fin rakaat 2").click();
  await expect(page.getByRole("textbox", { name: "Fin rakaat 2" })).toHaveValue(
    "17",
  );
});

test("overrides reset after validation and are not offered on done prayers", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [18]));
  await page.getByRole("textbox", { name: "Fin rakaat 2" }).fill("20");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Fin rakaat 1" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Fin rakaat 1" })).toHaveValue(
    "26",
  );
  const subh = page.locator(".prayer-card.active");
  await expect(subh).toContainText("v. 21");
  await expect(
    page.locator(".prayer-card").first().getByLabel("Fin rakaat 1"),
  ).toHaveCount(0);
});
