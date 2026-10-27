import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState, passageWithinRule } from "./helpers.js";
import {
  abasaSections,
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
  const state = updateKnown(fullState("2026-10-05"), [80], ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("Abasa keeps three themes aligned with both QSU and tafsir sections", () => {
  assert.equal(abasaSections.surah, 80);
  assert.deepEqual(
    abasaSections.blocks.map((b) => [b.from, b.to]),
    [
      [1, 16],
      [17, 32],
      [33, 42],
    ],
  );
  const qsuEnds = new Set(abasaSections.evidence.qsuWholeVerseEnds);
  for (const block of abasaSections.blocks) {
    assert.ok(qsuEnds.has(block.to));
  }
  assert.deepEqual(
    abasaSections.evidence.tafsirGroups.map((g) => [g.from, g.to]),
    [
      [1, 16],
      [17, 32],
      [33, 42],
    ],
  );
  assert.equal(sectionsForSurah(80).id, "abasa-v1");
});

test("every Abasa theme fits half a page and never mixes with the next", () => {
  const { state, corpus } = setup();
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const result = takePassage(corpus, cursor, 0, limit);
      if (result.passage.blocked) {
        assert.equal(result.cursor, cursor);
        continue;
      }
      const p = result.passage;
      const first = sectionFor(80, p.from);
      const lastBlock = sectionFor(80, p.to);
      assert.equal(p.from, corpus[cursor].verse);
      assert.ok(p.from >= first.from);
      assert.ok(lastBlock);
      if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
      assert.ok(passageWithinRule(p, limit));
      assert.equal(p.segmentation, "abasa-v1");
    }
  }
  const fajr = planDay(state, corpus)[0];
  assert.deepEqual(
    fajr.passages.map((p) => [p.from, p.to]),
    [[1, 42]],
  );
  assert.ok(fajr.cycleEnd);
  assert.ok(fajr.passages.every((p) => passageWithinRule(p, 1)));
});

test("a full Abasa cycle covers exactly the 42 verses and round-trips", () => {
  let { state, corpus } = setup();
  const revised = [];
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
  assert.ok(state.cycles > 0);
  assert.deepEqual(
    revised.flatMap((p) =>
      Array.from({ length: p.to - p.from + 1 }, (_, i) => p.from + i),
    ),
    Array.from({ length: 42 }, (_, i) => i + 1),
  );
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});
