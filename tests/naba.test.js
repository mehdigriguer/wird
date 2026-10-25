import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState, passageWithinRule } from "./helpers.js";
import { nabaSections, sectionFor, sectionsForSurah } from "../src/sections.js";
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
  const state = updateKnown(fullState("2026-10-05"), [78], ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("An-Naba keeps three QSU-aligned themes as indivisible blocks", () => {
  assert.equal(nabaSections.surah, 78);
  assert.equal(nabaSections.tafsirApiUnreliable, true);
  assert.deepEqual(
    nabaSections.blocks.map((b) => [b.from, b.to]),
    [
      [1, 16],
      [17, 30],
      [31, 40],
    ],
  );
  const qsuEnds = new Set(nabaSections.evidence.qsuWholeVerseEnds);
  for (const block of nabaSections.blocks) {
    assert.ok(qsuEnds.has(block.to));
  }
  assert.equal(sectionsForSurah(78).id, "naba-v1");
  assert.match(nabaSections.sources.tafsir.note, /groupes tronqués/);
});

test("the 31–36/37–40 merge is deliberate: QSU marks no restart at 37", () => {
  assert.ok(!nabaSections.evidence.qsuWholeVerseEnds.includes(36));
  assert.ok(nabaSections.evidence.qsuWholeVerseEnds.includes(34));
  assert.ok(nabaSections.evidence.qsuWholeVerseEnds.includes(38));
  assert.deepEqual(
    nabaSections.evidence.tafsirGroups.map((g) => [g.from, g.to]),
    [
      [1, 16],
      [17, 30],
      [31, 36],
      [37, 40],
    ],
  );
});

test("An-Naba passages fill by length inside one theme and never cross it", () => {
  const { corpus } = setup();
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const result = takePassage(corpus, cursor, 0, limit);
      if (result.passage.blocked) {
        assert.equal(result.cursor, cursor);
        continue;
      }
      const p = result.passage;
      const first = sectionFor(78, p.from);
      const lastBlock = sectionFor(78, p.to);
      assert.equal(p.from, corpus[cursor].verse);
      assert.ok(p.from >= first.from);
      assert.ok(lastBlock);
      if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
      assert.ok(passageWithinRule(p, limit));
      assert.equal(p.segmentation, "naba-v1");
    }
  }
  const half = takePassage(corpus, 0, 0, 0.5);
  assert.deepEqual([half.passage.from, half.passage.to], [1, 16]);
});

test("a plan starting at 17 serves 17–30 in the morning at half-page, whole", () => {
  const { state, corpus } = setup({ 78: { from: 17, to: 40 } });
  state.limits.fajr = 0.5;
  const plan = planDay(state, corpus);
  assert.deepEqual(
    [plan[0].passages[0].from, plan[0].passages[0].to],
    [17, 30],
  );
  assert.deepEqual(
    [plan[0].passages[1].from, plan[0].passages[1].to],
    [31, 40],
  );
  assert.ok(plan[0].passages.every((p) => passageWithinRule(p, 0.5)));
  const after = recordPrayer(state, corpus, "fajr", "done");
  assert.equal(after.cycles, 1);
});

test("An-Naba ranges ending mid-theme simply stop at the learned verse", () => {
  const { state, corpus } = setup({ 78: { from: 1, to: 10 } });
  const planned = takePassage(corpus, 0, 0, 1);
  assert.ok(!planned.passage.blocked);
  assert.equal(planned.passage.to, 10);
  assert.ok(!forecast(state, corpus).blocked);
  const { corpus: midCorpus } = setup({ 78: { from: 5, to: 20 } });
  const mid = takePassage(midCorpus, 0, 0, 1);
  assert.equal(mid.passage.from, 5);
  assert.ok(!mid.passage.blocked);
});

test("a full An-Naba cycle covers exactly the 40 verses and round-trips", () => {
  let { state, corpus } = setup();
  const revised = [];
  for (let day = 0; day < 3; day++) {
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
      if (state.cycles) break;
    }
    if (state.cycles) break;
    state = {
      ...state,
      day: { date: `2026-10-0${6 + day}`, extras: [], results: {} },
    };
  }
  assert.ok(state.cycles > 0);
  assert.deepEqual(
    revised.flatMap((p) =>
      Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i),
    ),
    Array.from({ length: 40 }, (_, i) => i + 1),
  );
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});
