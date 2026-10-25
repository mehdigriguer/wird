import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState, passageWithinRule } from "./helpers.js";
import {
  SECTIONS,
  kahfSections,
  sectionFor,
  sectionsForSurah,
} from "../src/sections.js";
import {
  buildCorpus,
  forecast,
  newState,
  planDay,
  recordPrayer,
  rollover,
  takePassage,
  updateKnown,
} from "../src/planner.js";
import { parseBackup } from "../src/storage.js";

const chapters = data.chapters;
const setup = (ranges) => {
  const state = updateKnown(fullState("2026-10-05"), [18], ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("every section file keeps continuous themes whose ends are QSU-confirmed", () => {
  for (const sections of SECTIONS) {
    const qsuEnds = new Set(sections.evidence.qsuWholeVerseEnds);
    let cursor = 1;
    const verseCount = chapters[sections.surah - 1].verses.length;
    for (const block of sections.blocks) {
      assert.equal(block.from, cursor);
      assert.ok(qsuEnds.has(block.to));
      assert.ok(!("stops" in block));
      cursor = block.to + 1;
    }
    assert.equal(cursor, verseCount + 1);
    assert.equal(sections.sources.qsu.license, "CC BY-NC 3.0");
    assert.equal(
      sections.sources.qsu.sha256,
      "fbc2ae6ef67b2ceb927442035174fd2baafaf66d0c088ec221e7d7e171fd3637",
    );
  }
  assert.equal(new Set(SECTIONS.map((s) => s.id)).size, SECTIONS.length);
  assert.equal(sectionsForSurah(2), null);
});

test("Al-Kahf keeps the eight supplied themes", () => {
  assert.deepEqual(
    kahfSections.blocks.map((b) => [b.from, b.to]),
    [
      [1, 8],
      [9, 26],
      [27, 31],
      [32, 44],
      [45, 59],
      [60, 82],
      [83, 98],
      [99, 110],
    ],
  );
  assert.equal(
    sectionFor(18, 9).title,
    "Les gens de la caverne et la fermeté dans la foi",
  );
});

test("inside a theme the planner fills by length, resumes anywhere, never crosses the boundary", () => {
  const { corpus } = setup();
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const result = takePassage(corpus, cursor, 0, limit);
      if (result.passage.blocked) {
        assert.equal(result.cursor, cursor);
        assert.ok(!("reason" in result.passage));
        assert.ok(corpus[cursor].end - corpus[cursor].start > limit);
        continue;
      }
      const p = result.passage;
      const first = sectionFor(18, p.from);
      const lastBlock = sectionFor(18, p.to);
      assert.equal(p.from, corpus[cursor].verse);
      assert.ok(p.from >= first.from);
      assert.ok(lastBlock);
      if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
      assert.ok(passageWithinRule(p, limit));
      assert.equal(p.segmentation, "kahf-v1");
      assert.ok(!("reason" in p));
    }
  }
});

test("finishing a theme may exceed the cap by half, never more", () => {
  const { corpus } = setup();
  // ½ page : v1-8 = 9 lignes ≤ 11,25 → le thème se termine dans la rakaat
  const half = takePassage(corpus, 0, 0, 0.5);
  assert.deepEqual([half.passage.from, half.passage.to], [1, 8]);
  assert.ok(passageWithinRule(half.passage, 0.5));
  // ¼ page : 9 lignes > 5,625 → tolérance refusée, coupure stricte à v1-2
  const quarter = takePassage(corpus, 0, 0, 0.25);
  assert.deepEqual([quarter.passage.from, quarter.passage.to], [1, 2]);
  assert.ok(quarter.passage.size <= 0.25 + 1e-9);
  // range apprise coupée au milieu du thème : pas d'extension au-delà de l'appris
  const partial = buildCorpus(chapters, [18], { 18: { from: 1, to: 6 } });
  const stopped = takePassage(partial, 0, 0, 1);
  assert.deepEqual([stopped.passage.from, stopped.passage.to], [1, 6]);
});

test("morning rakaat at half-page fill the theme by length", () => {
  const { state, corpus } = setup();
  const fajr = planDay(
    { ...state, limits: { ...state.limits, fajr: 0.5 } },
    corpus,
  )[0];
  // v7-8 finissent le thème dans la tolérance (9 lignes ≤ 0,75 page)
  assert.deepEqual(
    fajr.passages.map((p) => [p.from, p.to]),
    [
      [1, 8],
      [9, 13],
    ],
  );
  assert.ok(fajr.passages.every((p) => passageWithinRule(p, 0.5)));
  const after = recordPrayer(
    { ...state, limits: { ...state.limits, fajr: 0.5 } },
    corpus,
    "fajr",
    "done",
  );
  assert.equal(after.cursor, 13);
});

test("a full-page rakaat stops at the theme end even with room for the next theme", () => {
  const { corpus } = setup();
  const at25 = corpus.findIndex((v) => v.verse === 25);
  const atEnd = takePassage(corpus, at25, 0, 1);
  assert.deepEqual([atEnd.passage.from, atEnd.passage.to], [25, 26]);
  assert.ok(atEnd.passage.size < 1);
  assert.equal(takePassage(corpus, atEnd.cursor, 0, 1).passage.from, 27);
});

test("a mid-theme cursor resumes there without any restart flow", () => {
  const { state, corpus } = setup();
  const legacy = { ...state, cursor: 3 };
  assert.deepEqual(parseBackup(JSON.stringify(legacy), chapters), legacy);
  const planned = takePassage(corpus, 3, 0, 1);
  assert.equal(planned.passage.from, 4);
  assert.ok(planned.passage.to <= 8);
  assert.ok(!planned.passage.blocked);
});

test("a learned range ending mid-theme simply stops there and completes the cycle", () => {
  const { state, corpus } = setup({ 18: { from: 1, to: 10 } });
  const fajr = planDay(state, corpus)[0];
  assert.ok(fajr.passages.every((p) => p && !p.blocked && p.to <= 10));
  const after = recordPrayer(state, corpus, "fajr", "done");
  assert.equal(after.cursor, 0);
  assert.equal(after.cycles, 1);
  const done = recordPrayer(after, corpus, "subh", "done");
  assert.equal(done.cycles, 2);
  assert.equal(done.cursor, 0);
  const estimate = forecast(state, corpus);
  assert.ok(!estimate.blocked);
});

test("a learned range starting mid-theme starts exactly there", () => {
  const { corpus } = setup({ 18: { from: 3, to: 8 } });
  const planned = takePassage(corpus, 0, 0, 1);
  assert.equal(planned.passage.from, 3);
  assert.ok(!planned.passage.blocked);
});

test("only a verse larger than the cap blocks, and it is never bypassed", () => {
  const { corpus: original } = setup();
  const corpus = original.map((v) => ({ ...v }));
  corpus[0].end = corpus[0].start + 1.2;
  const next = takePassage(corpus, 0, 0, 1);
  assert.ok(next.passage.blocked);
  assert.equal(next.cursor, 0);
  const mixed = [...corpus.slice(0, 1), ...buildCorpus(chapters, [112])];
  assert.equal(takePassage(mixed, 0, 0, 1).cursor, 0);
});

test("forecasts match actual completed cycles for Al-Kahf", () => {
  let { state, corpus } = setup();
  const estimated = forecast(state, corpus);
  assert.ok(!estimated.blocked);
  const revised = [];
  let days;
  for (let day = 0; day < 10; day++) {
    if (day)
      state = rollover(state, `2026-10-${String(day + 5).padStart(2, "0")}`);
    for (const prayer of planDay(state, corpus)) {
      const planned = planDay(state, corpus).find((p) => p.id === prayer.id);
      state = recordPrayer(
        state,
        corpus,
        prayer.id,
        planned.passages.some((p) => p && !p.blocked) ? "done" : "skipped",
      );
      revised.push(
        ...state.history
          .at(-1)
          .passages.filter((p) => p && !p.blocked && p.cycle === 1),
      );
      if (state.cycles) {
        days = day + 1;
        break;
      }
    }
    if (days) break;
  }
  assert.equal(days, estimated.days);
  assert.deepEqual(
    revised.flatMap((p) =>
      Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i),
    ),
    Array.from({ length: 110 }, (_, i) => i + 1),
  );
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});

test("imported segmented passages must stay inside one theme with the right id", () => {
  const { state, corpus } = setup();
  const valid = recordPrayer(state, corpus, "fajr", "done");
  assert.deepEqual(parseBackup(JSON.stringify(valid), chapters), valid);
  for (const modify of [
    (p) => {
      p.segmentation = "unknown";
    },
    (p) => {
      p.from = 8;
      p.to = 9;
    },
    (p) => {
      p.surah = 2;
    },
  ]) {
    const invalid = structuredClone(valid);
    modify(invalid.day.results.fajr.passages[0]);
    assert.throws(() => parseBackup(JSON.stringify(invalid), chapters));
  }
});
