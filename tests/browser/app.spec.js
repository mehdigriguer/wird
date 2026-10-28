import { test, expect } from "@playwright/test";
import { localDate, newState, updateKnown } from "../../src/planner.js";
import { fullState } from "../helpers.js";

const key = "wird.progress.v1";
async function chooseSurahs(page) {
  await page
    .getByRole("button", { name: "Choisir mes sourates" })
    .first()
    .click();
  for (const id of [112, 113, 114]) {
    await page.getByRole("searchbox").fill(String(id));
    await page.locator(".surah-option input").check();
  }
  await page.getByRole("button", { name: "Enregistrer ma sélection" }).click();
}
async function enableOptionalPrayers(page) {
  await page.evaluate((k) => {
    const s = JSON.parse(localStorage.getItem(k));
    s.prayersEnabled = { fajr: true, chafaa: true, witr: true };
    localStorage.setItem(k, JSON.stringify(s));
  }, key);
  await page.reload();
}
async function stored(page) {
  return page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
}
async function seed(page, state) {
  await page.goto("/");
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key, state },
  );
  await page.reload();
}

test("onboarding, exact passages, real validation, undo and reload", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Un peu chaque jour" }),
  ).toBeVisible();
  await chooseSurahs(page);
  await enableOptionalPrayers(page);
  await expect(page.locator(".prayer-card")).toHaveCount(8);
  await expect(page.locator(".prayer-card").first()).toContainText("Al-Ikhlas");
  await expect(page.locator(".prayer-card").first()).toContainText("Al-Falaq");
  expect((await stored(page)).cursor).toBe(0);
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  expect((await stored(page)).cursor).toBe(9);
  await expect(page.locator(".prayer-card.active")).toContainText("Subh");
  await page.reload();
  await expect(page.locator(".prayer-card").first()).toContainText("Révisé");
  expect((await stored(page)).cursor).toBe(9);
  await page
    .locator(".prayer-card.done")
    .getByRole("button", { name: "Annuler", exact: true })
    .click();
  expect((await stored(page)).cursor).toBe(0);
  await expect(page.locator(".prayer-card.active")).toContainText("Fajr");
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("programme.png"),
    fullPage: true,
  });
});

test("partial memorization is editable, persisted and used by the cycle and statistics", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choisir mes sourates" })
    .first()
    .click();
  await page.getByRole("searchbox").fill("Al-Baqarah");
  await page.locator(".surah-option input").check();
  await expect(page.getByLabel("Premier verset Al-Baqarah")).toHaveValue("1");
  await expect(page.getByLabel("Dernier verset Al-Baqarah")).toHaveValue("286");
  await page.getByLabel("Dernier verset Al-Baqarah").fill("40");
  await expect(page.getByRole("dialog")).toContainText("40 / 286 versets");
  await page.screenshot({ path: testInfo.outputPath("partial-surah.png") });
  await page.getByRole("button", { name: "Enregistrer ma sélection" }).click();
  expect((await stored(page)).ranges).toEqual({ 2: { from: 1, to: 40 } });
  await expect(page.locator(".orbit-days")).toBeVisible();
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const before = await stored(page);
  for (const p of before.history[0].passages)
    expect(p.to).toBeLessThanOrEqual(40);
  await page.reload();
  await page.getByRole("button", { name: "Mémorisation", exact: true }).click();
  const stats = page.locator(".memory-heading .progress-stats span");
  await expect(stats.nth(0)).toContainText("0");
  await expect(stats.nth(0)).toContainText("surat apprise");
  await expect(stats.nth(1)).toContainText("1");
  await expect(stats.nth(1)).toContainText("surat en cours");
  await expect(stats.nth(2)).toContainText("0");
  await expect(stats.nth(2)).toContainText("juz appris");
  await expect(stats.nth(3)).toContainText("5,3");
  await expect(stats.nth(3)).toContainText("pages apprises");
  await expect(page.locator(".memory-heading")).toContainText("0,9 %");
  await expect(page.locator(".memory-heading")).toContainText("du Coran");
  const baqarahCard = page.getByRole("button", {
    name: /Al-Baqarah, versets 1 à 40 appris/,
  });
  await expect(baqarahCard).toHaveClass(/partial/);
  await baqarahCard.click();
  await expect(page.getByRole("dialog")).toContainText("Surat Al-Baqarah");
  await expect(page.getByRole("radio", { name: /Une portion/ })).toBeChecked();
  await page.getByRole("button", { name: "Annuler" }).click();
  await page.getByRole("button", { name: /Al-Baqarah/ }).click();
  await expect(page.getByLabel("Dernier verset Al-Baqarah")).toHaveValue("40");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  expect(await stored(page)).toEqual(before);
  await page.getByRole("button", { name: /Al-Baqarah/ }).click();
  await page.getByLabel("Dernier verset Al-Baqarah").fill("60");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  const extended = await stored(page);
  expect(extended.ranges).toEqual({ 2: { from: 1, to: 60 } });
  expect(extended.cursor).toBe(0);
  expect(extended.epoch).toBe(before.epoch + 1);
  expect(extended.history).toEqual(before.history);
  await page.getByRole("button", { name: /Al-Baqarah/ }).click();
  await page.getByRole("radio", { name: /Toute la sourate/ }).check();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  expect((await stored(page)).ranges).toEqual({});
  const after = page.locator(".memory-heading .progress-stats span");
  await expect(after.nth(0)).toContainText("1");
  await expect(after.nth(0)).toContainText("surat apprise");
  await expect(after.nth(1)).toContainText("0");
  await expect(after.nth(1)).toContainText("surat en cours");
});

test("invalid portions cannot be saved, even when hidden by the search", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Choisir mes sourates" })
    .first()
    .click();
  await page.getByRole("searchbox").fill("Al-Baqarah");
  await page.locator(".surah-option input").check();
  const save = page.getByRole("button", { name: "Enregistrer ma sélection" });
  for (const to of ["", "0", "287", "40.5"]) {
    await page.getByLabel("Dernier verset Al-Baqarah").fill(to);
    await expect(save).toBeDisabled();
    await expect(page.getByRole("alert")).toContainText("Al-Baqarah");
  }
  await page.getByLabel("Dernier verset Al-Baqarah").fill("40");
  await page.getByLabel("Premier verset Al-Baqarah").fill("41");
  await page.getByRole("searchbox").fill("An-Nas");
  await expect(save).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Al-Baqarah");
  await page.getByRole("searchbox").fill("Al-Baqarah");
  await page.getByLabel("Premier verset Al-Baqarah").fill("30");
  await expect(save).toBeEnabled();
  await save.click();
  expect((await stored(page)).ranges).toEqual({ 2: { from: 30, to: 40 } });
  // la portion tient dans une prière à 1 page : elle attend Dhuhr entière
  await expect(page.locator(".prayer-card").first()).toContainText(
    "Prière libre",
  );
  await expect(page.locator(".prayer-card").nth(2)).toContainText("v. 30");
});

test("legacy local data and exports keep their whole surahs and revision progress", async ({
  page,
}) => {
  await page.goto("/");
  await chooseSurahs(page);
  await enableOptionalPrayers(page);
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  const legacy = await stored(page);
  legacy.version = 1;
  delete legacy.ranges;
  await seed(page, legacy);
  await expect(page.locator(".prayer-card.active")).toContainText("Subh");
  await page.getByRole("button", { name: "Prières", exact: true }).click();
  const dhuhrChip = page.getByRole("button", { name: /Plafond Dhuhr/ });
  await dhuhrChip.click(); // 1 → ¼
  await dhuhrChip.click(); // ¼ → ½
  await page.getByRole("button", { name: "Programme", exact: true }).click();
  const migrated = await stored(page);
  expect(migrated.version).toBe(2);
  expect(migrated.ranges).toEqual({});
  expect(migrated.cursor).toBe(legacy.cursor);
  expect(migrated.known).toEqual(legacy.known);
  expect(migrated.history).toEqual(legacy.history);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Importer un fichier de sauvegarde").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  expect((await stored(page)).version).toBe(2);
  expect((await stored(page)).cursor).toBe(legacy.cursor);
  expect((await stored(page)).history).toEqual(legacy.history);
});

test("partial portions round-trip through export and import", async ({
  page,
}) => {
  const state = updateKnown(fullState(localDate()), [2, 112], {
    2: { from: 30, to: 40 },
  });
  await seed(page, state);
  await page.getByRole("button", { name: "Mes données", exact: true }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter ma sauvegarde" }).click();
  const stream = await (await downloading).createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = Buffer.concat(chunks);
  expect(JSON.parse(backup.toString()).ranges).toEqual(state.ranges);
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Importer un fichier de sauvegarde").setInputFiles({
    name: "partial.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page.reload();
  expect((await stored(page)).ranges).toEqual(state.ranges);
  await expect(page.locator(".prayer-card").first()).toContainText("v. 30");
});

test("progress never rounds up to a completed cycle and the current prayer has a direct link", async ({
  page,
}) => {
  const state = updateKnown(fullState(localDate()), [2]);
  state.cursor = 285;
  await seed(page, state);
  await expect(
    page.getByLabel("Cycle 1, 99 % des versets révisés"),
  ).toBeVisible();
  await expect(page.locator("#next-prayer")).toBeVisible();
  expect((await stored(page)).cycles).toBe(0);
});

test("nawafil are configured, added, removed and forecast does not change actual progress", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [2]));
  const before = (await stored(page)).cursor;
  await page.getByRole("button", { name: "Ajouter une prière" }).click();
  await page
    .getByRole("dialog")
    .getByRole("radio", { name: "Qiyam/Tahajjud" })
    .check();
  await page
    .getByRole("dialog")
    .getByRole("group", { name: "Nombre de rakaat" })
    .getByRole("button", { name: "4 rakaat", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("group", { name: "Nombre de page par rakaat" })
    .getByRole("button", { name: "1 page" })
    .click();
  await page.getByRole("button", { name: "Ajouter aujourd’hui" }).click();
  await expect(page.locator(".prayer-card")).toHaveCount(9);
  await expect(page.locator(".prayer-card").nth(8)).toContainText(
    "Qiyam/Tahajjud",
  );
  expect((await stored(page)).cursor).toBe(before);
  expect((await stored(page)).day.extras[0].rakaat).toBe(4);
  await page.getByRole("button", { name: "Retirer Qiyam/Tahajjud" }).click();
  await expect(page.locator(".prayer-card")).toHaveCount(8);
});

test("report shifts unvalidated passages", async ({ page }) => {
  await page.goto("/");
  await chooseSurahs(page);
  await enableOptionalPrayers(page);
  await page
    .getByRole("button", { name: "J’ai prié autrement", exact: true })
    .click();
  expect((await stored(page)).cursor).toBe(0);
  await expect(page.locator(".prayer-card.active")).toContainText("Subh");
  await expect(page.locator(".prayer-card.active")).toContainText("Al-Ikhlas");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  expect((await stored(page)).cursor).toBe(9);
});

test("cycle rollover is real, not projected, and appears in history", async ({
  page,
}) => {
  await page.goto("/");
  await chooseSurahs(page);
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  expect((await stored(page)).cycles).toBe(0);
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  expect((await stored(page)).cycles).toBe(1);
  const history = (await stored(page)).history;
  expect(history).toHaveLength(2);
  expect(history.flatMap((e) => e.passages).every((p) => p.cycle >= 1)).toBe(
    true,
  );
});

test("a midnight reload clears extras without advancing revision", async ({
  page,
}) => {
  const state = updateKnown(fullState("2020-01-01"), [2]);
  state.cursor = 10;
  state.day.extras = [
    { id: "extra-test", name: "Duha", after: "subh", limit: 1, rakaat: 2 },
  ];
  await seed(page, state);
  await expect(page.locator(".prayer-card")).toHaveCount(8);
  await expect(page.locator(".prayer-card").first()).toContainText("v. 11");
  await page.getByRole("button", { name: "Prières", exact: true }).click();
  const dhuhrChip = page.getByRole("button", { name: /Plafond Dhuhr/ });
  await dhuhrChip.click(); // 1 → ¼
  await dhuhrChip.click(); // ¼ → ½
  expect((await stored(page)).cursor).toBe(10);
  expect((await stored(page)).day.date).toBe(localDate());
  expect((await stored(page)).day.extras).toEqual([]);
});

test("export contains actual data and invalid imports leave current progress intact", async ({
  page,
}) => {
  await page.goto("/");
  await chooseSurahs(page);
  await page.getByRole("button", { name: "Mes données", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter ma sauvegarde" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^wird-.*\.json$/);
  const stream = await download.createReadStream();
  const parts = [];
  for await (const part of stream) parts.push(part);
  const exported = JSON.parse(Buffer.concat(parts).toString());
  expect(exported.known).toEqual([112, 113, 114]);
  await page.getByLabel("Importer un fichier de sauvegarde").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.getByRole("status")).toContainText("Sauvegarde invalide");
  expect((await stored(page)).known).toEqual([112, 113, 114]);
  page.on("dialog", (dialog) => dialog.accept());
  const replacement = updateKnown(fullState(localDate()), [2]);
  await page.getByLabel("Importer un fichier de sauvegarde").setInputFiles({
    name: "valid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(replacement)),
  });
  await expect(page.locator(".announcement")).toBeEmpty();
  expect((await stored(page)).known).toEqual([2]);
});

test("corrupt local storage is not silently erased", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((k) => localStorage.setItem(k, "{broken"), key);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ta sauvegarde a besoin d’attention" }),
  ).toBeVisible();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBe(
    "{broken",
  );
});

test("two tabs see the same saved progress without double validation", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await chooseSurahs(page);
  await enableOptionalPrayers(page);
  const second = await context.newPage();
  await second.goto("/");
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  await expect(second.locator(".prayer-card.active")).toContainText("Subh");
  await second
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  await expect(page.locator(".prayer-card.active")).toContainText("Dhuhr");
  expect((await stored(page)).history).toHaveLength(2);
  await second.close();
});

test("no third-party requests are needed to use the site", async ({ page }) => {
  const external = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      external.push(request.url());
  });
  await page.goto("/");
  await chooseSurahs(page);
  await page.evaluate(() => document.fonts.ready);
  expect(external).toEqual([]);
});

test("navigation stays accessible on tablet and the modal closes with Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Mémorisation", exact: true }).click();
  const card = page.getByRole("button", { name: /Al-Fatihah/ });
  await card.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
});

test("the open page rolls over at local midnight without consuming verses", async ({
  page,
}) => {
  const nearMidnight = new Date(2026, 9, 5, 23, 59, 50);
  await page.clock.install({ time: nearMidnight });
  const state = updateKnown(fullState("2026-10-05"), [2]);
  state.cursor = 20;
  state.day.extras = [
    { id: "extra-test", name: "Duha", after: "subh", limit: 1, rakaat: 2 },
  ];
  await seed(page, state);
  await expect(page.locator(".prayer-card")).toHaveCount(9);
  await page.clock.fastForward(40000);
  await expect(page.locator(".prayer-card")).toHaveCount(8);
  expect((await stored(page)).cursor).toBe(20);
  expect((await stored(page)).day.date).toBe("2026-10-06");
});

test("unsaved progress survives an update from another tab", async ({
  page,
  context,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [2]));
  const second = await context.newPage();
  await second.goto("/");
  await page.getByRole("button", { name: "Prières", exact: true }).click();
  await second.getByRole("button", { name: "Prières", exact: true }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: /Plafond Dhuhr/ }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  const ishaChip = second.getByRole("button", { name: /Plafond Isha/ });
  await ishaChip.click(); // 1 → ¼
  await ishaChip.click(); // ¼ → ½
  await expect(page.getByRole("status")).toContainText("Un autre onglet");
  const dhuhrChip = page.getByRole("button", { name: /Plafond Dhuhr/ });
  await expect(dhuhrChip).toHaveAttribute("aria-label", /¼ page/);
  await page.getByRole("button", { name: /Plafond Asr/ }).click();
  await expect(page.getByRole("status")).toContainText(
    "Exporte tes changements",
  );
  await expect(dhuhrChip).toHaveAttribute("aria-label", /¼ page/);
  await expect(
    page.getByRole("button", { name: /Plafond Asr/ }),
  ).toHaveAttribute("aria-label", /1 page/);
  await second.close();
});

test("quota failure is visible and progress remains exportable", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await chooseSurahs(page);
  await expect(page.getByRole("alert")).toContainText(
    "sauvegarde sur cet appareil est indisponible",
  );
  await expect(page.locator(".prayer-card")).toHaveCount(7);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exporter maintenant" }).click();
  expect((await download).suggestedFilename()).toMatch(/wird/);
});

test("a cycle ending mid-prayer frees the remaining rakaat with a dedicated note", async ({
  page,
}) => {
  await seed(page, updateKnown(fullState(localDate()), [112, 113, 114]));
  const cards = page.locator(".prayer-card");
  const subh = cards.nth(1);
  await expect(subh).toContainText("An-Nas");
  await expect(subh).toContainText(
    "Rakaat libre : on vient de finir un cycle.",
  );
  await expect(subh).not.toContainText("prochaine prière");
  // le cycle 2 reprend à la prière suivante
  await expect(cards.nth(2)).toContainText("Al-Ikhlas");
});

test("the per-prayer limit chip cycles, replans and hides once validated", async ({
  page,
}) => {
  await seed(
    page,
    updateKnown(fullState(localDate()), [67], { 67: { from: 20, to: 30 } }),
  );
  const fajr = page.locator(".prayer-card").first();
  const chip = fajr.getByRole("button", { name: /Plafond Fajr/ });
  await expect(chip).toContainText("1 page");
  await expect(fajr).toContainText("v. 20–30");
  // à ¼ page, Al-Mulk ne tient plus dans la prière : elle est reportée
  await chip.click();
  await expect(chip).toContainText("¼ page");
  await expect(fajr).toContainText("Prière libre : Al-Mulk attend");
  let state = await stored(page);
  expect(state.day.limitOverrides.fajr).toBe(0.25);
  expect(state.limits.fajr).toBe(1);
  // à ½ page, elle tient en 2 rakaat coupées
  await chip.click();
  await expect(chip).toContainText("½ page");
  await expect(fajr).not.toContainText("Prière libre");
  await expect(fajr).toContainText("v. 20–");
  await expect(fajr).not.toContainText("v. 20–30");
  state = await stored(page);
  expect(state.day.limitOverrides.fajr).toBe(0.5);
  expect(state.limits.fajr).toBe(1);
  // revenir au défaut des réglages efface l'ajustement du jour
  await chip.click();
  await expect(chip).toContainText("1 page");
  await expect(fajr).toContainText("v. 20–30");
  state = await stored(page);
  expect(state.day.limitOverrides).toEqual({});
  // une fois la prière validée, le chip disparaît
  await page
    .getByRole("button", { name: "J’ai prié avec ces versets" })
    .click();
  await expect(
    fajr.getByRole("button", { name: /Plafond Fajr/ }),
  ).toHaveCount(0);
  // les prières suivantes gardent leur chip
  await expect(
    page.locator(".prayer-card").nth(1).getByRole("button", {
      name: /Plafond Subh/,
    }),
  ).toBeVisible();
});

test("welcome presets start a first cycle in one click", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Juz 30 complet" })).toBeVisible();
  await page.getByRole("button", { name: "Juz 30 complet" }).click();
  const state = await stored(page);
  expect(state.known).toHaveLength(37);
  expect(state.known[0]).toBe(78);
  expect(state.known.at(-1)).toBe(114);
  // An-Naba est atomique : elle attend Dhuhr, première prière à 1 page
  await expect(page.locator(".prayer-card").first()).toContainText(
    "Prière libre : An-Naba attend",
  );
  await expect(page.locator(".prayer-card").nth(2)).toContainText("An-Naba");
});

test("the Fatiha + Qul preset skips Fatiha in the cycle but counts it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Al-Fatiha + les Qul" }).click();
  expect((await stored(page)).known).toEqual([1, 112, 113, 114]);
  await expect(page.locator(".prayer-card").first()).toContainText("Al-Ikhlas");
});
