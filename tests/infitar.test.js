import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState, passageWithinRule } from "./helpers.js";
import {
  infitarSections,
  sectionFor,
  sectionsForSurah,
} from "../src/sections.js";
import {
  buildCorpus,
  newState,
  planDay,
  recordPrayer,
  takePassage,
  updateKnown,
} from "../src/planner.js";
import { parseBackup } from "../src/storage.js";

const chapters = data.chapters;
const setup = (ranges) => {
  const state = updateKnown(fullState("2026-10-05"), [82], ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("Al-Infitar keeps three QSU-confirmed themes", () => {
  assert.equal(infitarSections.surah, 82);
  assert.deepEqual(
    infitarSections.blocks.map((b) => [b.from, b.to]),
    [
      [1, 5],
      [6, 12],
      [13, 19],
    ],
  );
  const qsuEnds = new Set(infitarSections.evidence.qsuWholeVerseEnds);
  for (const block of infitarSections.blocks) {
    assert.ok(qsuEnds.has(block.to));
  }
  assert.equal(sectionsForSurah(82).id, "infitar-v1");
});

test("the whole surah chains into one rakaat at the 1-page default", () => {
  const { state, corpus } = setup();
  const fajr = planDay(state, corpus)[0];
  assert.deepEqual(
    fajr.passages.map((p) => [p.from, p.to]),
    [
      [1, 19],
      [1, 19],
    ],
  );
  assert.ok(fajr.passages.every((p) => passageWithinRule(p, 1)));
  const after = recordPrayer(state, corpus, "fajr", "done");
  assert.equal(after.cycles, 2);
  assert.deepEqual(parseBackup(JSON.stringify(after), chapters), after);
});

test("Al-Infitar passages respect the chaining invariant", () => {
  const { corpus } = setup();
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const result = takePassage(corpus, cursor, 0, limit);
      if (result.passage.blocked) continue;
      const p = result.passage;
      const first = sectionFor(82, p.from);
      const lastBlock = sectionFor(82, p.to);
      assert.ok(lastBlock);
      if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
      assert.ok(passageWithinRule(p, limit));
      assert.equal(p.segmentation, "infitar-v1");
    }
  }
});
