import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState } from "./helpers.js";
import { buildCorpus, dailyPrayers, planDay, updateKnown } from "../src/planner.js";
import { parseBackup } from "../src/storage.js";

const chapters = data.chapters;
const setup = (extra = {}, surahs = [112, 113, 114]) => {
  const base = fullState("2026-10-28");
  const state = updateKnown(
    {
      ...base,
      prayersEnabled: { ...base.prayersEnabled, qiyam: true },
      ...extra,
    },
    surahs,
  );
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("qiyam sans override garde 2 rakaat et son détail", () => {
  const { state } = setup();
  const qiyam = dailyPrayers(state).find((p) => p.id === "qiyam");
  assert.equal(qiyam.rakaat, 2);
  assert.equal(qiyam.detail, "2 rakaat");
});

test("l'override change le nombre de rakaat et le détail", () => {
  const { state } = setup({ rakaatOverrides: { qiyam: 8 } });
  const qiyam = dailyPrayers(state).find((p) => p.id === "qiyam");
  assert.equal(qiyam.rakaat, 8);
  assert.equal(qiyam.detail, "8 rakaat");
});

test("le programme du jour génère autant de passages que l'override", () => {
  const juz30 = Array.from({ length: 37 }, (_, i) => 78 + i);
  const { state, corpus } = setup(
    { rakaatOverrides: { qiyam: 6 } },
    juz30,
  );
  const qiyam = planDay(state, corpus).find((p) => p.id === "qiyam");
  assert.equal(qiyam.passages.length, 6);
});

test("la validation accepte les valeurs paires 2 à 12 pour qiyam", () => {
  const { state } = setup({ rakaatOverrides: { qiyam: 10 } });
  const parsed = parseBackup(JSON.stringify(state), chapters);
  assert.equal(parsed.rakaatOverrides.qiyam, 10);
});

test("la validation rejette les overrides hors clé ou hors valeurs", () => {
  const { state } = setup();
  const bad = { ...state, rakaatOverrides: { qiyam: 3 } };
  assert.throws(() => parseBackup(JSON.stringify(bad), chapters));
  const wrongKey = { ...state, rakaatOverrides: { duha: 4 } };
  assert.throws(() => parseBackup(JSON.stringify(wrongKey), chapters));
});

test("un backup sans rakaatOverrides reste valide", () => {
  const { state } = setup();
  const parsed = parseBackup(JSON.stringify(state), chapters);
  assert.deepEqual(parsed.rakaatOverrides, {});
});
