import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState, passageWithinRule } from "./helpers.js";
import { mulkSections, sectionFor, sectionsForSurah } from "../src/sections.js";
import {
  buildCorpus,
  forecast,
  newState,
  planDay,
  recordPrayer,
  takePassage,
  updateKnown,
} from "../src/planner.js";
import { parseBackup } from "../src/storage.js";

const chapters = data.chapters;
const setup = (ranges) => {
  const state = updateKnown(fullState("2026-10-05"), [67], ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("Al-Mulk keeps the three user-provided themes, all QSU-confirmed", () => {
  assert.equal(mulkSections.surah, 67);
  assert.deepEqual(
    mulkSections.blocks.map((b) => [b.from, b.to]),
    [
      [1, 5],
      [6, 14],
      [15, 30],
    ],
  );
  const qsuEnds = new Set(mulkSections.evidence.qsuWholeVerseEnds);
  let cursor = 1;
  for (const block of mulkSections.blocks) {
    assert.equal(block.from, cursor);
    assert.ok(qsuEnds.has(block.to));
    cursor = block.to + 1;
  }
  assert.equal(cursor, 31);
  assert.equal(sectionsForSurah(67).id, "mulk-v2");
  assert.equal(sectionsForSurah(2), null);
  assert.equal(mulkSections.sources.qsu.license, "CC BY-NC 3.0");
});

test("Al-Mulk passages fill by length inside one theme and never cross it", () => {
  const { corpus } = setup();
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const result = takePassage(corpus, cursor, 0, limit);
      if (result.passage.blocked) {
        assert.equal(result.cursor, cursor);
        continue;
      }
      const p = result.passage;
      const first = sectionFor(67, p.from);
      const lastBlock = sectionFor(67, p.to);
      assert.equal(p.from, corpus[cursor].verse);
      assert.ok(p.from >= first.from);
      assert.ok(lastBlock);
      if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
      assert.ok(passageWithinRule(p, limit));
      assert.equal(p.segmentation, "mulk-v2");
    }
  }
});

test("theme 15–30 completes within the 50 % tolerance, splits at half page", () => {
  const { corpus } = setup({ 67: { from: 15, to: 30 } });
  // 19 lignes : au-delà d'une page mais dans la tolérance (≤ 1,5 page)
  const first = takePassage(corpus, 0, 0, 1);
  assert.ok(!first.passage.blocked);
  assert.equal(first.passage.from, 15);
  assert.equal(first.passage.to, 30);
  assert.ok(passageWithinRule(first.passage, 1));
  // 19 lignes > 0,75 page : tolérance refusée, coupure par longueur
  const half = takePassage(corpus, 0, 0, 0.5);
  assert.ok(!half.passage.blocked);
  assert.equal(half.passage.from, 15);
  assert.ok(half.passage.to < 30);
  assert.ok(passageWithinRule(half.passage, 0.5));
  const second = takePassage(corpus, half.cursor, 0, 0.5);
  assert.ok(second.passage.from > half.passage.to);
  assert.ok(second.passage.to <= 30);
  let covered = 0;
  let cursor = 0;
  while (covered < 16) {
    const r = takePassage(corpus, cursor, 0, 1);
    covered += r.passage.to - r.passage.from + 1;
    cursor = r.cursor;
    assert.ok(r.passage.to <= 30);
  }
});

test("an Al-Mulk range ending mid-theme simply stops at the learned verse", () => {
  for (const to of [1, 4]) {
    const { state, corpus } = setup({ 67: { from: 1, to } });
    const planned = takePassage(corpus, 0, 0, 1);
    assert.ok(!planned.passage.blocked);
    assert.equal(planned.passage.to, to);
    assert.ok(!forecast(state, corpus).blocked);
  }
  const { corpus } = setup({ 67: { from: 2, to: 5 } });
  const planned = takePassage(corpus, 0, 0, 1);
  assert.equal(planned.passage.from, 2);
  assert.ok(!planned.passage.blocked);
});

test("verses 20–30 complete the morning at the 1-page default", () => {
  const { state, corpus } = setup({ 67: { from: 20, to: 30 } });
  const fajr = planDay(state, corpus)[0];
  assert.deepEqual(
    fajr.passages.map((p) => [p.from, p.to]),
    [
      [20, 30],
      [20, 30],
    ],
  );
  const after = recordPrayer(state, corpus, "fajr", "done");
  assert.equal(after.cycles, 2);
});

test("a full Al-Mulk cycle covers exactly the 30 verses and round-trips", () => {
  let { state, corpus } = setup();
  for (const prayer of planDay(state, corpus)) {
    const planned = planDay(state, corpus).find((p) => p.id === prayer.id);
    state = recordPrayer(
      state,
      corpus,
      prayer.id,
      planned.passages.some((p) => p && !p.blocked) ? "done" : "skipped",
    );
    if (state.cycles) break;
  }
  assert.ok(state.cycles > 0);
  const revised = state.history
    .flatMap((e) => e.passages)
    .filter((p) => p && !p.blocked && p.cycle === 1)
    .flatMap((p) =>
      Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i),
    );
  assert.deepEqual(
    revised,
    Array.from({ length: 30 }, (_, i) => i + 1),
  );
  assert.ok(
    state.history
      .flatMap((e) => e.passages)
      .filter((p) => p && !p.blocked)
      .every((p) => p.segmentation === "mulk-v2"),
  );
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});

test("Kahf and Mulk can be scheduled together without crossing their themes", () => {
  const state = updateKnown(fullState("2026-10-05"), [18, 67], {
    18: { from: 1, to: 8 },
  });
  const corpus = buildCorpus(chapters, state.known, state.ranges);
  for (let cursor = 0; cursor < corpus.length; cursor++) {
    const result = takePassage(corpus, cursor, 0, 1);
    if (result.passage.blocked) continue;
    const p = result.passage;
    const first = sectionFor(p.surah, p.from);
    const lastBlock = sectionFor(p.surah, p.to);
    assert.ok(lastBlock);
    if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
    assert.equal(p.segmentation, sectionsForSurah(p.surah).id);
  }
});
