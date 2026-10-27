import { test, expect } from "@playwright/test";
import { localDate, newState, updateKnown } from "../../src/planner.js";
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

test("changing page scrolls back to the top", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [18, 67, 112]));
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 800));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Mémorisation", exact: true }).click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("an open modal locks background scrolling", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  const overflow = () =>
    page.evaluate(() => getComputedStyle(document.body).overflow);
  expect(await overflow()).toBe("visible");
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await overflow()).toBe("hidden");
  await page.getByRole("button", { name: "Fermer" }).click();
  expect(await overflow()).toBe("visible");
});

test("the notice links to the program settings", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Ajout exceptionnel");
  await dialog.getByRole("button", { name: "Prières du programme" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Prières du programme" }),
  ).toBeVisible();
});

test("the picker says so when every optional prayer is already enabled", async ({
  page,
}) => {
  const state = updateKnown(fullState(localDate()), [112]);
  for (const k of Object.keys(state.prayersEnabled))
    state.prayersEnabled[k] = true;
  await seed(page, state);
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Ajouter aujourd’hui" }),
  ).toHaveCount(0);
  await expect(dialog).toContainText(
    "Toutes les prières sont déjà au programme",
  );
});

test("a surah that fits one prayer is never split across two", async ({
  page,
}) => {
  await seed(
    page,
    updateKnown(fullState(localDate()), [67, 78, 79, 80, 81, 82, 83]),
  );
  const cards = page.locator(".prayer-card");
  // Maghreb : Infitar seul, rakaat libre (Mutaffifin reportée)
  const maghrib = cards.nth(4);
  await expect(maghrib).toContainText("Al-Infitar · v. 1–19");
  await expect(maghrib).not.toContainText("Al-Mutaffifin");
  await expect(maghrib).toContainText("Rakaat libre");
  // Isha : Mutaffifin entier
  const isha = cards.nth(5);
  await expect(isha).toContainText("Al-Mutaffifin · v. 1–28");
  await expect(isha).toContainText("Al-Mutaffifin · v. 29–36");
  // Witr entièrement reporté, n'apparaît pas comme à valider
  const witr = cards.nth(7);
  await expect(witr).toContainText("Rien à réviser ici");
  await expect(witr).not.toContainText("An-Naba");
  // la validation suit son cours sans être bloquée par Witr
  for (let i = 0; i < 7; i++)
    await page
      .getByRole("button", { name: "J’ai prié avec ces versets" })
      .click();
  await expect(cards.nth(7)).not.toContainText("J’ai prié avec ces versets");
});

test("rakaat are locked per prayer, only qiyam is free", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Duha" }).check();
  await expect(
    dialog.getByRole("group", { name: "Nombre de rakaat" }),
  ).toHaveCount(0);
  await dialog.getByRole("radio", { name: "Avant Dhuhr" }).check();
  await expect(
    dialog.getByRole("group", { name: "Nombre de rakaat" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ajouter aujourd’hui" }).click();
  expect((await stored(page)).day.extras[0].rakaat).toBe(4);
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  await dialog.getByRole("radio", { name: "Qiyam/Tahajjud" }).check();
  const rakaatGroup = dialog.getByRole("group", { name: "Nombre de rakaat" });
  await expect(rakaatGroup).toBeVisible();
  // switching from a locked prayer resets the free count to 2
  await expect(
    rakaatGroup.getByRole("button", { name: "2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await rakaatGroup.getByRole("button", { name: "6", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter aujourd’hui" }).click();
  expect((await stored(page)).day.extras[1].rakaat).toBe(6);
});

test("the picker follows the settings toggles", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  const dialog = page.getByRole("dialog");
  // fullState: duha off, fajr/chafaa/witr on
  await expect(dialog.getByRole("radio", { name: "Duha" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Fajr" })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "Chafaa" })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "Witr" })).toHaveCount(0);
  // rawatib and night prayers are offered while disabled
  await expect(
    dialog.getByRole("radio", { name: "Avant Dhuhr" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("radio", { name: "Qiyam/Tahajjud" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByLabel("Avant Dhuhr dans le programme").click();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  await expect(dialog.getByRole("radio", { name: "Avant Dhuhr" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByLabel("Avant Dhuhr dans le programme").click();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();

  // enable duha, disable witr and fajr in settings
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByLabel("Duha dans le programme").click();
  await page.getByLabel("Witr dans le programme").click();
  await page.getByLabel("Fajr dans le programme").click();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  await expect(dialog.getByRole("radio", { name: "Duha" })).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "Fajr" })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Witr" })).toBeVisible();

  // fajr extra lands first, witr extra offers odd rakaat and lands last
  await dialog.getByRole("radio", { name: "Fajr" }).check();
  await page.getByRole("button", { name: "Ajouter aujourd’hui" }).click();
  await expect(page.locator(".prayer-card").first()).toContainText("Fajr");
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  await dialog.getByRole("radio", { name: "Witr" }).check();
  await expect(
    dialog.getByRole("group", { name: "Nombre de rakaat" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Ajouter aujourd’hui" }).click();
  await expect(page.locator(".prayer-card").last()).toContainText("Witr");
  const stored = JSON.parse(
    await page.evaluate(() => localStorage.getItem("wird.progress.v1")),
  );
  expect(stored.day.extras[0]).toMatchObject({ name: "Fajr", after: null });
  expect(stored.day.extras[1]).toMatchObject({
    name: "Witr",
    rakaat: 1,
    after: "chafaa",
  });
});

test("named extras land at their position in the program", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  await page
    .getByRole("dialog")
    .getByRole("radio", { name: "Après Maghreb" })
    .check();
  await page.getByRole("button", { name: "Ajouter aujourd’hui" }).click();
  expect((await stored(page)).day.extras[0].after).toBe("maghrib");
  const cards = page.locator(".prayer-card");
  await expect(cards.nth(4)).toContainText("Maghreb");
  await expect(cards.nth(5)).toContainText("Après Maghreb");
  await expect(cards.nth(6)).toContainText("Isha");
});

test("each named extra lands in its expected slot", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  const expectations = [
    ["Duha", 2],
    ["Avant Dhuhr", 3],
    ["Après Dhuhr", 5],
    ["Après Maghreb", 8],
    ["Après Isha", 10],
    ["Qiyam/Tahajjud", 13],
  ];
  // base: fajr,subh,dhuhr,asr,maghrib,isha,chafaa,witr; chaque extra inséré décale la suite
  for (const [name, position] of expectations) {
    await page.getByRole("button", { name: "Ajouter une prière" }).click();
    await page.getByRole("dialog").getByRole("radio", { name }).check();
    await page.getByRole("button", { name: "Ajouter aujourd’hui" }).click();
    await expect(page.locator(".prayer-card").nth(position)).toContainText(
      name,
    );
  }
});

test("the quantity picker follows the enabled prayers", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  const panel = page.locator(".settings-panel", {
    hasText: "Prières du programme",
  });
  // fard prayers have no toggle but always show their picker
  await expect(panel.getByLabel("Subh dans le programme")).toHaveCount(0);
  await expect(
    panel.getByRole("group", { name: "Plafond Subh" }),
  ).toBeVisible();
  for (const name of ["Fajr", "Chafaa", "Witr"])
    await expect(
      panel.getByRole("group", { name: `Plafond ${name}` }),
    ).toBeVisible();
  // duha is off: its card shows no picker until enabled
  await expect(panel.getByRole("group", { name: "Plafond Duha" })).toHaveCount(
    0,
  );
  await page.getByLabel("Duha dans le programme").click();
  await expect(
    panel.getByRole("group", { name: "Plafond Duha" }),
  ).toBeVisible();
  await page.getByLabel("Chafaa dans le programme").click();
  await expect(
    panel.getByRole("group", { name: "Plafond Chafaa" }),
  ).toHaveCount(0);
  // the limit chosen in the merged section applies to the day
  await panel
    .getByRole("group", { name: "Plafond Duha" })
    .getByRole("button", { name: "1 page" })
    .click();
  expect((await stored(page)).limits.duha).toBe(1);
});

test("prayer toggles in settings drive the daily program", async ({ page }) => {
  await seed(page, updateKnown(fullState(localDate()), [112]));
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Prières du programme" }),
  ).toBeVisible();
  const fajrToggle = page.getByLabel("Fajr dans le programme");
  await expect(fajrToggle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await expect(page.locator(".prayer-card")).toHaveCount(8);
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await fajrToggle.click();
  await page.getByLabel("Chafaa dans le programme").click();
  await page.getByLabel("Witr dans le programme").click();
  await page.getByRole("button", { name: "Aujourd’hui", exact: true }).click();
  await expect(page.locator(".prayer-card")).toHaveCount(5);
  await expect(page.locator(".prayer-card").first()).toContainText("Subh");
  expect((await stored(page)).prayersEnabled).toEqual({
    fajr: false,
    duha: false,
    "avant-dhuhr": false,
    "apres-dhuhr": false,
    "apres-maghrib": false,
    "apres-isha": false,
    chafaa: false,
    witr: false,
    qiyam: false,
  });
});

test("a fresh install starts with fajr, witr and the obligatory five", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choisir mes sourates" })
    .last()
    .click();
  await page.getByRole("searchbox").fill("112");
  await page.locator(".surah-option input").check();
  await page.getByRole("button", { name: "Enregistrer ma sélection" }).click();
  await expect(page.locator(".prayer-card")).toHaveCount(7);
  await expect(page.locator(".prayer-card").first()).toContainText("Fajr");
  await expect(page.locator(".prayer-card").last()).toContainText("Witr");
  await page.getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Plafond Subh" })
      .getByRole("button", { name: "½ page" }),
  ).toHaveAttribute("aria-pressed", "true");
});
