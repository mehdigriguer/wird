import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState, passageWithinRule } from "./helpers.js";
import {
  mutaffifinSections,
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
  const state = updateKnown(fullState("2026-10-05"), [83], ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("Al-Mutaffifin keeps three QSU-confirmed themes", () => {
  assert.equal(mutaffifinSections.surah, 83);
  assert.deepEqual(
    mutaffifinSections.blocks.map((b) => [b.from, b.to]),
    [
      [1, 17],
      [18, 28],
      [29, 36],
    ],
  );
  const qsuEnds = new Set(mutaffifinSections.evidence.qsuWholeVerseEnds);
  for (const block of mutaffifinSections.blocks) {
    assert.ok(qsuEnds.has(block.to));
  }
  assert.equal(sectionsForSurah(83).id, "mutaffifin-v1");
  assert.deepEqual(
    mutaffifinSections.evidence.tafsirGroups.map((g) => [g.from, g.to]),
    [
      [1, 6],
      [7, 17],
      [18, 28],
      [29, 36],
    ],
  );
});

test("Al-Mutaffifin passages respect the chaining invariant", () => {
  const { corpus } = setup();
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const result = takePassage(corpus, cursor, 0, limit);
      if (result.passage.blocked) continue;
      const p = result.passage;
      const first = sectionFor(83, p.from);
      const lastBlock = sectionFor(83, p.to);
      assert.ok(lastBlock);
      if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
      assert.ok(passageWithinRule(p, limit));
      assert.equal(p.segmentation, "mutaffifin-v1");
    }
  }
});

test("a full Al-Mutaffifin cycle covers exactly the 36 verses and round-trips", () => {
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
    Array.from({ length: 36 }, (_, i) => i + 1),
  );
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});
