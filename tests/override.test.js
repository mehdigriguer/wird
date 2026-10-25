import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import { fullState } from "./helpers.js";
import {
  buildCorpus,
  newState,
  planDay,
  planPrayer,
  recordPrayer,
  updateKnown,
} from "../src/planner.js";
import { parseBackup } from "../src/storage.js";

const chapters = data.chapters;
const setup = (known, ranges) => {
  const state = updateKnown(fullState("2026-10-05"), known, ranges ?? {});
  return { state, corpus: buildCorpus(chapters, state.known, state.ranges) };
};

test("extend a rakaat beyond the cap, up to the theme end", () => {
  const { state, corpus } = setup([18]);
  const prayer = planDay(state, corpus)[0];
  const planned = planPrayer(corpus, 0, 0, prayer);
  const [r1, r2] = planned.passages;
  assert.deepEqual([r1.from, r1.to], [1, 8]);
  const extended = planPrayer(corpus, 0, 0, prayer, { 1: 26 });
  assert.deepEqual(
    [extended.passages[1].from, extended.passages[1].to],
    [9, 26],
  );
  assert.equal(extended.passages[1].overridden, true);
  assert.ok(extended.passages[1].size > 1);
  const recorded = recordPrayer(state, corpus, "fajr", "done", { 1: 26 });
  assert.equal(recorded.cursor, 26);
  assert.deepEqual(parseBackup(JSON.stringify(recorded), chapters), recorded);
});

test("shorten a rakaat and let the next one replan from there", () => {
  const { state, corpus } = setup([18]);
  const prayer = planDay(state, corpus)[0];
  const shortened = planPrayer(corpus, 0, 0, prayer, { 0: 4 });
  assert.deepEqual(
    [shortened.passages[0].from, shortened.passages[0].to],
    [1, 4],
  );
  assert.equal(shortened.passages[1].from, 5);
  const recorded = recordPrayer(state, corpus, "fajr", "done", { 0: 4 });
  assert.equal(recorded.cursor, shortened.cursor);
});

test("override stays inside the theme and the learned verses", () => {
  const { state, corpus } = setup([18]);
  const prayer = planDay(state, corpus)[0];
  for (const bad of [27, 30, 110]) {
    assert.throws(() => planPrayer(corpus, 0, 0, prayer, { 1: bad }));
  }
  const { corpus: partial } = setup([18], { 18: { from: 9, to: 12 } });
  assert.throws(() =>
    planPrayer(partial, 0, 0, planDay(state, partial)[0], { 0: 13 }),
  );
  for (const bad of [0, 8, 3.5, "x"]) {
    assert.throws(() => planPrayer(corpus, 0, 0, prayer, { 1: bad }));
  }
});

test("override never crosses into another surah for unsectioned surahs", () => {
  const { state, corpus } = setup([112, 113]);
  const prayer = planDay(state, corpus)[0];
  const ok = planPrayer(corpus, 0, 0, prayer, { 0: 4 });
  assert.equal(ok.passages[0].to, 4);
  assert.throws(() => planPrayer(corpus, 0, 0, prayer, { 0: 5 }));
});

test("override is ignored on blocked passages and rejected for wrong prayer", () => {
  const { state, corpus } = setup([18]);
  assert.throws(() => recordPrayer(state, corpus, "subh", "done", { 0: 26 }));
  const skipped = recordPrayer(state, corpus, "fajr", "skipped", { 0: 26 });
  assert.equal(skipped.cursor, 0);
});

test("overrides only shape the active prayer in the day plan", () => {
  const { state, corpus } = setup([18]);
  const plan = planDay(state, corpus, { 1: 26 });
  assert.equal(plan[0].passages[1].to, 26);
  assert.equal(plan[1].passages[0].from, 27);
  const recorded = recordPrayer(state, corpus, "fajr", "done", { 1: 26 });
  assert.deepEqual(planDay(recorded, corpus)[1].passages[0].from, 27);
});
