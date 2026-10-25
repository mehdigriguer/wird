import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState, passageWithinRule } from "./helpers.js";
import {
  naziatSections,
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
  const state = updateKnown(fullState("2026-10-05"), [79], ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("An-Nazi'at keeps the three user-provided themes, all QSU-confirmed", () => {
  assert.equal(naziatSections.surah, 79);
  assert.equal(naziatSections.tafsirApiUnreliable, true);
  assert.deepEqual(
    naziatSections.blocks.map((b) => [b.from, b.to]),
    [
      [1, 14],
      [15, 26],
      [27, 46],
    ],
  );
  const qsuEnds = new Set(naziatSections.evidence.qsuWholeVerseEnds);
  for (const block of naziatSections.blocks) {
    assert.ok(qsuEnds.has(block.to));
  }
  assert.equal(sectionsForSurah(79).id, "naziat-v2");
  assert.match(naziatSections.sources.tafsir.note, /tronque/);
});

test("theme 27–46 merges two tafsir sections by user choice, ends stay QSU-confirmed", () => {
  assert.ok(naziatSections.evidence.qsuWholeVerseEnds.includes(46));
  assert.ok(naziatSections.evidence.qsuWholeVerseEnds.includes(33));
  assert.deepEqual(
    naziatSections.evidence.tafsirGroups.map((g) => [g.from, g.to]),
    [
      [1, 14],
      [15, 26],
      [27, 33],
      [34, 46],
    ],
  );
});

test("every theme fits half a page and never mixes with the next", () => {
  const { corpus } = setup();
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const result = takePassage(corpus, cursor, 0, limit);
      if (result.passage.blocked) {
        assert.equal(result.cursor, cursor);
        continue;
      }
      const p = result.passage;
      const first = sectionFor(79, p.from);
      const lastBlock = sectionFor(79, p.to);
      assert.equal(p.from, corpus[cursor].verse);
      assert.ok(p.from >= first.from);
      assert.ok(lastBlock);
      if (first !== lastBlock) assert.equal(p.to, lastBlock.to);
      assert.ok(passageWithinRule(p, limit));
      assert.equal(p.segmentation, "naziat-v2");
    }
  }
  const fajr = planDay(setup().state, corpus)[0];
  assert.deepEqual(
    fajr.passages.map((p) => [p.from, p.to]),
    [
      [1, 26],
      [27, 46],
    ],
  );
  assert.ok(fajr.passages.every((p) => passageWithinRule(p, 1)));
});

test("legacy naziat-v1 passages stay valid because they fit inside v2 themes", () => {
  const { state, corpus } = setup();
  const legacy = {
    ...state,
    day: {
      ...state.day,
      results: {
        fajr: {
          status: "done",
          passages: [
            {
              surah: 79,
              from: 1,
              to: 5,
              page: 583,
              endPage: 583,
              size: 0.2,
              cycle: 1,
              segmentation: "naziat-v1",
            },
          ],
        },
      },
    },
    history: [
      {
        status: "done",
        passages: [
          {
            surah: 79,
            from: 1,
            to: 5,
            page: 583,
            endPage: 583,
            size: 0.2,
            cycle: 1,
            segmentation: "naziat-v1",
          },
        ],
        date: state.day.date,
        prayerId: "fajr",
        name: "Fajr",
        epoch: 0,
        beforeCursor: 0,
        beforeCycles: 0,
      },
    ],
    cursor: 5,
  };
  assert.deepEqual(parseBackup(JSON.stringify(legacy), chapters), legacy);
  const invalid = structuredClone(legacy);
  invalid.day.results.fajr.passages[0].segmentation = "naziat-v0";
  assert.throws(() => parseBackup(JSON.stringify(invalid), chapters));
});

test("a full An-Nazi'at cycle covers exactly the 46 verses and round-trips", () => {
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
    Array.from({ length: 46 }, (_, i) => i + 1),
  );
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});
