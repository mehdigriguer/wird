import test from "node:test";
import assert from "node:assert/strict";
import data from "../src/data/quran.json" with { type: "json" };
import {
  PRAYERS,
  buildCorpus,
  canUndo,
  dailyPrayers,
  forecast,
  isValidRange,
  juzCoverage,
  knownRange,
  learnedJuz,
  learnedPages,
  localDate,
  newState,
  planDay,
  recordPrayer,
  rollover,
  takePassage,
  undoLast,
  updateKnown,
} from "../src/planner.js";
import { parseBackup, validateState } from "../src/storage.js";
import { fullState, passageWithinRule } from "./helpers.js";
import { sectionFor } from "../src/sections.js";
import juzData from "../src/data/juz.json" with { type: "json" };

const chapters = data.chapters;
const stateFor = (known, ranges = {}) =>
  updateKnown(fullState("2026-10-05"), known, ranges);
const corpusFor = (known, ranges = {}) => buildCorpus(chapters, known, ranges);
const clone = (value) => structuredClone(value);
const extra = {
  id: "extra-test",
  name: "Duha",
  rakaat: 12,
  limit: 1,
  after: "subh",
};

test("metadata has every chapter and verse, valid ordered locations and known anchors", () => {
  assert.equal(chapters.length, 114);
  assert.equal(
    chapters.reduce((n, c) => n + c.verses.length, 0),
    6236,
  );
  chapters.forEach((c, index) => {
    assert.equal(c.id, index + 1);
    assert.ok(c.name && c.arabic);
    c.verses.forEach(([p, l, ep, el]) => {
      assert.ok(p >= 1 && ep <= 604 && ep >= p);
      assert.ok(l >= 1 && l <= 15 && el >= 1 && el <= 15);
      assert.ok(ep > p || el >= l);
    });
  });
  assert.deepEqual(chapters[0].pages, [1, 1]);
  assert.deepEqual(chapters[1].verses[0], [2, 3, 2, 3]);
  assert.equal(chapters[1].verses[281][0], 48);
  assert.deepEqual(chapters[113].pages, [604, 604]);
  const corpus = corpusFor(chapters.map((c) => c.id));
  corpus.forEach((v, i) => {
    assert.ok(v.start < v.end && v.end - v.start <= 1 + 1e-9);
    if (i) assert.ok(v.start >= corpus[i - 1].start);
  });
});

test("the default program is the obligatory five plus fajr and witr", () => {
  const state = newState();
  assert.deepEqual(
    dailyPrayers(state).map((p) => p.id),
    ["fajr", "subh", "dhuhr", "asr", "maghrib", "isha", "witr"],
  );
  assert.equal(
    dailyPrayers(state).reduce((n, p) => n + p.rakaat, 0),
    13,
  );
  for (const p of dailyPrayers(state)) assert.equal(p.limit, 0.5);
  assert.deepEqual(state.prayersEnabled, {
    fajr: true,
    duha: false,
    "avant-dhuhr": false,
    "apres-dhuhr": false,
    "apres-maghrib": false,
    "apres-isha": false,
    chafaa: false,
    witr: true,
    qiyam: false,
  });
});

test("an extra with no position opens the day, witr keeps one rakaat", () => {
  let state = stateFor([112]);
  state = {
    ...state,
    day: {
      ...state.day,
      extras: [
        { id: "extra-fajr", name: "Fajr", after: null, limit: 1, rakaat: 2 },
        { id: "extra-witr", name: "Witr", after: "isha", limit: 1, rakaat: 1 },
      ],
    },
  };
  const prayers = dailyPrayers(state);
  assert.equal(prayers[0].name, "Fajr");
  assert.equal(prayers[0].extra, true);
  assert.equal(prayers.at(-1).name, "Witr");
  assert.equal(prayers.at(-1).rakaat, 1);
  const roundTrip = parseBackup(JSON.stringify(state), chapters);
  assert.equal(roundTrip.day.extras[0].after, null);
  assert.equal(roundTrip.day.extras[1].rakaat, 1);
});

test("duha sits between Subh and Dhuhr when enabled", () => {
  const state = {
    ...newState(),
    prayersEnabled: { ...newState().prayersEnabled, duha: true },
  };
  assert.deepEqual(
    dailyPrayers(state).map((p) => p.id),
    ["fajr", "subh", "duha", "dhuhr", "asr", "maghrib", "isha", "witr"],
  );
});

test("optional prayers join the program only when enabled", () => {
  const state = fullState();
  assert.deepEqual(
    dailyPrayers(state).map((p) => p.rakaat),
    [2, 2, 2, 2, 2, 2, 2, 1],
  );
  const withoutWitr = {
    ...state,
    prayersEnabled: { ...state.prayersEnabled, witr: false },
  };
  assert.deepEqual(
    dailyPrayers(withoutWitr).map((p) => p.id),
    ["fajr", "subh", "dhuhr", "asr", "maghrib", "isha", "chafaa"],
  );
});

test("no selected surahs and Fatiha alone have no revision cycle", () => {
  for (const known of [[], [1]]) {
    const state = stateFor(known);
    const corpus = corpusFor(known);
    assert.equal(corpus.length, 0);
    assert.equal(forecast(state, corpus), null);
    assert.ok(
      planDay(state, corpus).every((p) => p.passages.every((v) => v === null)),
    );
    assert.throws(() => recordPrayer(state, corpus, "fajr", "done"));
  }
});

test("selection is canonical and Fatiha is excluded from revision", () => {
  const state = stateFor([114, 1, 112, 112]);
  assert.deepEqual(state.known, [1, 112, 114]);
  assert.deepEqual(
    [...new Set(corpusFor(state.known).map((v) => v.surah))],
    [112, 114],
  );
});

test("short surahs never share a rakaat and a cycle can wrap within a prayer", () => {
  const state = stateFor([112, 113, 114]);
  const corpus = corpusFor(state.known);
  const plan = planDay(state, corpus);
  assert.deepEqual(
    plan[0].passages.map((p) => [p.surah, p.from, p.to, p.cycle]),
    [
      [112, 1, 4, 1],
      [113, 1, 5, 1],
    ],
  );
  assert.deepEqual(
    plan[1].passages.map((p) => [p.surah, p.cycle]),
    [
      [114, 1],
      [112, 2],
    ],
  );
  assert.equal(state.cursor, 0);
  assert.equal(state.cycles, 0);
  const afterFajr = recordPrayer(state, corpus, "fajr", "done");
  assert.equal(afterFajr.cursor, 9);
  const afterSubh = recordPrayer(afterFajr, corpus, "subh", "done");
  assert.equal(afterSubh.cycles, 1);
  assert.equal(afterSubh.cursor, 4);
});

test("every possible starting verse respects all ceilings, one surah, exact order", () => {
  const corpus = corpusFor(chapters.map((c) => c.id));
  for (const limit of [0.25, 0.5, 1]) {
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      const next = takePassage(corpus, cursor, 0, limit);
      if (next.passage.blocked) {
        assert.equal(next.cursor, cursor);
        assert.equal(next.cycles, 0);
        assert.ok(corpus[cursor].end - corpus[cursor].start > limit);
      } else {
        assert.equal(next.passage.surah, corpus[cursor].surah);
        assert.equal(next.passage.from, corpus[cursor].verse);
        assert.ok(passageWithinRule(next.passage, limit));
        assert.ok(next.passage.to >= next.passage.from);
        const first = sectionFor(next.passage.surah, next.passage.from);
        const lastBlock = sectionFor(next.passage.surah, next.passage.to);
        if (first) {
          assert.ok(lastBlock);
          if (first !== lastBlock) assert.equal(next.passage.to, lastBlock.to);
        }
        assert.equal(
          next.cursor,
          (cursor + next.passage.to - next.passage.from + 1) % corpus.length,
        );
      }
    }
  }
});

test("Al-Baqarah opening page uses its special layout, not fifteen lines", () => {
  const passage = takePassage(corpusFor([2]), 0, 0, 0.5).passage;
  assert.equal(passage.to, 3);
  assert.ok(passageWithinRule(passage, 0.5));
  assert.equal(takePassage(corpusFor([2]), 0, 0, 1).passage.to, 5);
});

test("a long verse waits without being split, skipped, or overflowing chosen caps", () => {
  const corpus = corpusFor([2]);
  const state = {
    ...stateFor([2]),
    cursor: 281,
    limits: { ...fullState().limits, fajr: 0.5, subh: 0.5 },
  };
  const plan = planDay(state, corpus);
  assert.ok(plan[0].passages.every((p) => p.blocked));
  assert.ok(plan[1].passages.every((p) => p.blocked));
  assert.equal(plan[2].passages[0].from, 282);
  assert.ok(passageWithinRule(plan[2].passages[0], 1));
  assert.throws(() => recordPrayer(state, corpus, "fajr", "done"));
  const skipped = recordPrayer(state, corpus, "fajr", "skipped");
  assert.equal(skipped.cursor, 281);
});

test("blocked forecast terminates when all recurring slots are too small", () => {
  const state = {
    ...stateFor([2]),
    cursor: 281,
    limits: Object.fromEntries(PRAYERS.map((p) => [p.id, 0.25])),
  };
  assert.deepEqual(forecast(state, corpusFor([2])), { blocked: true });
});

test("forecast is a simulation, never advances real progress, and nawafil shorten only today", () => {
  const state = stateFor([2]);
  const corpus = corpusFor([2]);
  const before = clone(state);
  const baseline = forecast(state, corpus);
  const withExtra = { ...state, day: { ...state.day, extras: [extra] } };
  const accelerated = forecast(withExtra, corpus);
  assert.ok(accelerated.days < baseline.days);
  assert.deepEqual(forecast(withExtra, corpus, false), baseline);
  assert.deepEqual(state, before);
  let simulated = clone(withExtra);
  let finishedDay;
  for (let day = 0; day < 20; day++) {
    if (day)
      simulated = rollover(
        simulated,
        `2026-10-${String(day + 5).padStart(2, "0")}`,
      );
    for (const p of dailyPrayers(simulated)) {
      const active = planDay(simulated, corpus).find((x) => x.id === p.id);
      simulated = recordPrayer(
        simulated,
        corpus,
        p.id,
        active.passages.some((v) => v && !v.blocked) ? "done" : "skipped",
      );
      if (simulated.cycles > 0) {
        finishedDay = day + 1;
        break;
      }
    }
    if (finishedDay) break;
  }
  assert.equal(accelerated.days, finishedDay);
});

test("validation is ordered and cannot be counted twice", () => {
  const state = stateFor([2]);
  const corpus = corpusFor([2]);
  assert.throws(() => recordPrayer(state, corpus, "subh", "done"));
  const next = recordPrayer(state, corpus, "fajr", "done");
  assert.throws(() => recordPrayer(next, corpus, "fajr", "done"));
  assert.throws(() => recordPrayer(state, corpus, "fajr", "unknown"));
  assert.ok(next.cursor > 0);
  assert.equal(next.history.length, 1);
});

test("reporting a prayer preserves passages and moves them to the next prayer", () => {
  const state = stateFor([112, 113, 114]);
  const corpus = corpusFor(state.known);
  const original = planDay(state, corpus)[0].passages;
  const next = recordPrayer(state, corpus, "fajr", "skipped");
  assert.equal(next.cursor, 0);
  assert.equal(next.cycles, 0);
  assert.deepEqual(planDay(next, corpus)[1].passages, original);
});

test("undo restores progress even across a completed cycle", () => {
  const state = stateFor([112]);
  const corpus = corpusFor([112]);
  const next = recordPrayer(state, corpus, "fajr", "done");
  assert.equal(next.cycles, 2);
  assert.ok(canUndo(next));
  assert.deepEqual(undoLast(next), state);
  const skipped = recordPrayer(state, corpus, "fajr", "skipped");
  assert.deepEqual(undoLast(skipped), state);
});

test("midnight uses local calendar, discards daily extras, never validates by itself", () => {
  const state = stateFor([2]);
  state.day.extras = [extra];
  const after = recordPrayer(state, corpusFor([2]), "fajr", "done");
  assert.equal(rollover(after, after.day.date), after);
  const tomorrow = rollover(after, "2026-10-06");
  assert.equal(tomorrow.cursor, after.cursor);
  assert.equal(tomorrow.cycles, after.cycles);
  assert.deepEqual(tomorrow.day, {
    date: "2026-10-06",
    extras: [],
    results: {},
  });
  assert.equal(tomorrow.history.length, 1);
  assert.equal(canUndo(tomorrow), false);
  assert.equal(localDate(new Date(2026, 9, 5, 0, 1)), "2026-10-05");
});

test("changing selection starts a new active tour but keeps history and completed tours", () => {
  const state = recordPrayer(stateFor([112]), corpusFor([112]), "fajr", "done");
  const same = updateKnown(state, [112]);
  assert.equal(same, state);
  const next = updateKnown(state, [2]);
  assert.equal(next.cycles, 2);
  assert.equal(next.cursor, 0);
  assert.deepEqual(next.history, state.history);
  assert.equal(canUndo(next), false);
  assert.doesNotThrow(() => validateState(next, chapters));
});

test("done references remain unchanged when quantity or nawafil change", () => {
  const state = recordPrayer(stateFor([2]), corpusFor([2]), "fajr", "done");
  const next = {
    ...state,
    limits: { ...state.limits, fajr: 0.25 },
    day: { ...state.day, extras: [extra] },
  };
  assert.deepEqual(
    planDay(next, corpusFor([2]))[0].passages,
    state.day.results.fajr.passages,
  );
});

test("after all prayers are reported, estimate begins tomorrow", () => {
  let state = stateFor([112]);
  const corpus = corpusFor([112]);
  for (const p of dailyPrayers(state))
    state = recordPrayer(state, corpus, p.id, "skipped");
  assert.deepEqual(forecast(state, corpus), { days: 2, dateOffset: 1 });
});

test("valid backups round-trip including history and extras", () => {
  let state = stateFor([2, 112]);
  state.day.extras = [extra];
  const corpus = corpusFor(state.known);
  state = recordPrayer(state, corpus, "fajr", "done");
  state = recordPrayer(state, corpus, "subh", "skipped");
  state = recordPrayer(state, corpus, extra.id, "done");
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});

test("partial memorization includes only the declared verses and retains their real locations", () => {
  const opening = corpusFor([2], { 2: { from: 1, to: 40 } });
  assert.equal(opening.length, 40);
  assert.equal(opening[0].verse, 1);
  assert.equal(opening.at(-1).verse, 40);
  const middle = corpusFor([2], { 2: { from: 30, to: 40 } });
  assert.deepEqual(middle, corpusFor([2]).slice(29, 40));
  assert.equal(middle.length, 11);
  assert.deepEqual(knownRange(chapters[1]), { from: 1, to: 286 });
  assert.equal(corpusFor([1], { 1: { from: 1, to: 4 } }).length, 0);
});

test("every partial boundary keeps numbering, one surah and page ceilings intact", () => {
  for (const chapter of chapters.slice(1)) {
    const from = Math.max(1, Math.floor(chapter.verses.length / 2));
    const to = Math.min(from + 9, chapter.verses.length);
    const corpus = corpusFor([chapter.id], { [chapter.id]: { from, to } });
    for (let cursor = 0; cursor < corpus.length; cursor++) {
      for (const limit of [0.25, 0.5, 1]) {
        const next = takePassage(corpus, cursor, 0, limit);
        if (next.passage.blocked) {
          assert.equal(next.cursor, cursor);
        } else {
          assert.equal(next.passage.from, from + cursor);
          assert.ok(next.passage.to <= to);
          assert.ok(passageWithinRule(next.passage, limit));
          assert.equal(next.passage.surah, chapter.id);
        }
      }
    }
  }
});

test("a cycle covers exactly the known portions, then wraps to their first verse", () => {
  const ranges = { 2: { from: 30, to: 40 }, 112: { from: 2, to: 3 } };
  let state = stateFor([2, 112], ranges);
  const corpus = corpusFor(state.known, state.ranges);
  assert.equal(corpus.length, 13);
  for (const prayer of dailyPrayers(state)) {
    state = recordPrayer(state, corpus, prayer.id, "done");
    if (state.cycles) break;
  }
  assert.ok(state.cycles > 0);
  const revised = state.history
    .flatMap((event) => event.passages)
    .filter((p) => p && !p.blocked && p.cycle === 1)
    .flatMap((p) =>
      Array.from(
        { length: p.to - p.from + 1 },
        (_, i) => `${p.surah}:${p.from + i}`,
      ),
    );
  assert.deepEqual(
    revised,
    corpus.map((v) => `${v.surah}:${v.verse}`),
  );
  const last = takePassage(corpus, corpus.length - 1, 0, 1);
  assert.equal(last.cycles, 1);
  assert.equal(last.cursor, 0);
  assert.equal(
    takePassage(corpus, last.cursor, last.cycles, 1).passage.from,
    30,
  );
  assert.deepEqual(parseBackup(JSON.stringify(state), chapters), state);
});

test("one known verse can complete a cycle without reciting the rest of its surah", () => {
  const ranges = { 112: { from: 3, to: 3 } };
  const corpus = corpusFor([112], ranges);
  const state = recordPrayer(stateFor([112], ranges), corpus, "fajr", "done");
  assert.equal(state.cycles, 2);
  assert.ok(
    state.day.results.fajr.passages.every((p) => p.from === 3 && p.to === 3),
  );
});

test("partial ranges drive forecasts and still respect long-verse blocking", () => {
  const ranges = { 2: { from: 1, to: 40 } };
  const partial = forecast(stateFor([2], ranges), corpusFor([2], ranges));
  const full = forecast(stateFor([2]), corpusFor([2]));
  assert.ok(partial.days < full.days);
  const longRange = { 2: { from: 282, to: 282 } };
  const state = stateFor([2], longRange);
  state.limits.fajr = 0.5;
  state.limits.subh = 0.5;
  const plan = planDay(state, corpusFor([2], longRange));
  assert.ok(plan[0].passages.every((p) => p.blocked));
  assert.equal(plan[2].passages[0].from, 282);
  assert.equal(plan[2].passages[0].to, 282);
});

test("extending, shrinking or removing a range resets only the active tour", () => {
  const ranges = { 2: { from: 1, to: 40 } };
  const state = recordPrayer(
    stateFor([2], ranges),
    corpusFor([2], ranges),
    "fajr",
    "done",
  );
  assert.equal(updateKnown(state, [2], { 2: { to: 40, from: 1 } }), state);
  for (const nextRanges of [
    { 2: { from: 1, to: 60 } },
    { 2: { from: 20, to: 30 } },
    {},
  ]) {
    const next = updateKnown(state, [2], nextRanges);
    assert.equal(next.cursor, 0);
    assert.equal(next.epoch, state.epoch + 1);
    assert.equal(next.cycles, state.cycles);
    assert.deepEqual(next.history, state.history);
    assert.deepEqual(next.day.results, state.day.results);
    assert.equal(canUndo(next), false);
    assert.doesNotThrow(() => validateState(next, chapters));
  }
  assert.deepEqual(updateKnown(state, [112]).ranges, {});
});

test("legacy backups migrate without losing selection, cursor, history, or completed cycles", () => {
  let legacy = recordPrayer(
    stateFor([112, 113, 114]),
    corpusFor([112, 113, 114]),
    "fajr",
    "done",
  );
  legacy = recordPrayer(legacy, corpusFor(legacy.known), "subh", "done");
  legacy.version = 1;
  delete legacy.ranges;
  const before = clone(legacy);
  const migrated = parseBackup(JSON.stringify(legacy), chapters);
  assert.deepEqual(migrated, { ...before, version: 2, ranges: {} });
  assert.deepEqual(legacy, before);
  assert.deepEqual(
    buildCorpus(chapters, migrated.known, migrated.ranges),
    corpusFor(legacy.known),
  );
  assert.equal(migrated.cursor, 4);
  assert.equal(migrated.cycles, 1);
  assert.equal(undoLast(migrated).cycles, 0);
  const invalidLegacy = { ...legacy, cursor: 999 };
  assert.throws(() => parseBackup(JSON.stringify(invalidLegacy), chapters));
});

test("invalid or missing ranges are rejected, including in imported backups", () => {
  const invalid = [
    null,
    [],
    {},
    { from: 0, to: 40 },
    { from: 40, to: 1 },
    { from: 1, to: 287 },
    { from: 1.5, to: 40 },
    { from: 1, to: 40.5 },
    { from: "1", to: 40 },
    { from: 1, to: "" },
  ];
  for (const range of invalid) {
    assert.equal(isValidRange(range, 286), false);
    const state = { ...stateFor([2]), ranges: { 2: range } };
    assert.throws(() => parseBackup(JSON.stringify(state), chapters));
  }
  for (const ranges of [
    null,
    [],
    { 115: { from: 1, to: 2 } },
    { "02": { from: 1, to: 2 } },
    { 3: { from: 1, to: 2 } },
  ]) {
    assert.throws(() =>
      parseBackup(JSON.stringify({ ...stateFor([2]), ranges }), chapters),
    );
  }
  const missing = stateFor([2]);
  delete missing.ranges;
  assert.throws(() => parseBackup(JSON.stringify(missing), chapters));
  const outOfBoundsCursor = {
    ...stateFor([2], { 2: { from: 1, to: 40 } }),
    cursor: 40,
  };
  assert.throws(() => parseBackup(JSON.stringify(outOfBoundsCursor), chapters));
});

test("existing backups without prayersEnabled keep all optional prayers on", () => {
  const legacy = structuredClone(stateFor([112]));
  delete legacy.prayersEnabled;
  const migrated = parseBackup(JSON.stringify(legacy), chapters);
  assert.deepEqual(migrated.prayersEnabled, {
    fajr: true,
    duha: false,
    "avant-dhuhr": false,
    "apres-dhuhr": false,
    "apres-maghrib": false,
    "apres-isha": false,
    chafaa: true,
    witr: true,
    qiyam: false,
  });
  const withoutDuha = parseBackup(
    JSON.stringify({
      ...stateFor([112]),
      prayersEnabled: { fajr: true, chafaa: true, witr: true },
      limits: {
        fajr: 1,
        subh: 1,
        dhuhr: 1,
        asr: 1,
        maghrib: 1,
        isha: 1,
        chafaa: 1,
        witr: 1,
      },
    }),
    chapters,
  );
  assert.equal(withoutDuha.limits.duha, 0.5);
  assert.deepEqual(withoutDuha.prayersEnabled, {
    fajr: true,
    duha: false,
    "avant-dhuhr": false,
    "apres-dhuhr": false,
    "apres-maghrib": false,
    "apres-isha": false,
    chafaa: true,
    witr: true,
    qiyam: false,
  });
  const fresh = parseBackup(JSON.stringify(newState()), chapters);
  assert.deepEqual(fresh.prayersEnabled, {
    fajr: true,
    duha: false,
    "avant-dhuhr": false,
    "apres-dhuhr": false,
    "apres-maghrib": false,
    "apres-isha": false,
    chafaa: false,
    witr: true,
    qiyam: false,
  });
  const yesterday = parseBackup(
    JSON.stringify({
      ...stateFor([112]),
      prayersEnabled: { fajr: false, chafaa: false, witr: false },
    }),
    chapters,
  );
  assert.deepEqual(yesterday.prayersEnabled, {
    fajr: false,
    duha: false,
    "avant-dhuhr": false,
    "apres-dhuhr": false,
    "apres-maghrib": false,
    "apres-isha": false,
    chafaa: false,
    witr: false,
    qiyam: false,
  });
  for (const bad of [
    { fajr: "oui", chafaa: true, witr: true },
    { duha: 2 },
    null,
  ]) {
    assert.throws(() =>
      parseBackup(
        JSON.stringify({ ...stateFor([112]), prayersEnabled: bad }),
        chapters,
      ),
    );
  }
});

test("invalid backups are rejected before overwriting anything", () => {
  const mutations = [
    (s) => {
      s.version = 3;
    },
    (s) => {
      s.known = [0];
    },
    (s) => {
      s.known = [114, 2];
    },
    (s) => {
      s.known = [2, 2];
    },
    (s) => {
      s.cursor = -1;
    },
    (s) => {
      s.cursor = 999;
    },
    (s) => {
      s.limits.isha = 2;
    },
    (s) => {
      s.cycles = 1.5;
    },
    (s) => {
      s.day.date = "oops";
    },
    (s) => {
      s.day.date = "2026-02-31";
    },
    (s) => {
      s.day.extras = [{ ...extra, rakaat: 100 }];
    },
    (s) => {
      s.day.extras = [{ ...extra, after: "invalid" }];
    },
    (s) => {
      s.day.extras = [extra, extra];
    },
    (s) => {
      s.day.results.invalid = { status: "skipped", passages: [] };
    },
    (s) => {
      s.day.results.fajr = { status: "done", passages: [] };
    },
    (s) => {
      s.history = [{ status: "done" }];
    },
  ];
  for (const mutate of mutations) {
    const state = stateFor([2]);
    mutate(state);
    assert.throws(() => parseBackup(JSON.stringify(state), chapters));
  }
  for (const invalid of ["null", "[]", "{}", "not json", "x".repeat(5_000_001)])
    assert.throws(() => parseBackup(invalid, chapters));
});

test("learnedPages spans from first to last learned verse per surah", () => {
  const baqarah = learnedPages(chapters, [2], { 2: { from: 1, to: 40 } });
  assert.ok(baqarah > 5 && baqarah < 6);
  assert.equal(learnedPages(chapters, [1]), 1);
  const kahf = learnedPages(chapters, [18]);
  assert.ok(kahf > 11 && kahf < 12);
  const partial = learnedPages(chapters, [2, 18], {
    2: { from: 1, to: 40 },
  });
  assert.ok(partial > baqarah + kahf - 1e-9);
  assert.equal(learnedPages(chapters, []), 0);
});

test("a surah that fits one prayer never straddles two prayers", () => {
  const state = updateKnown(
    fullState("2026-10-05"),
    [67, 78, 79, 80, 81, 82, 83],
  );
  const corpus = corpusFor(state.known, state.ranges);
  const plan = planDay(state, corpus);
  const byId = Object.fromEntries(plan.map((p) => [p.id, p]));
  const span = (p) =>
    p.passages.filter(Boolean).map((x) => `${x.surah}:${x.from}-${x.to}`);
  // Al-Mutaffifin ne tient pas dans la fin de Maghreb : reportée, r2 vide
  assert.deepEqual(span(byId.maghrib), ["82:1-19"]);
  // Isha la contient entière
  assert.deepEqual(span(byId.isha), ["83:1-28", "83:29-36"]);
  // Chafaa contient Al-Mulk entier
  assert.deepEqual(span(byId.chafaa), ["67:1-14", "67:15-30"]);
  // An-Naba attend le lendemain : Witr entièrement reporté
  assert.deepEqual(byId.witr.passages, []);
  // une grosse sourate traverse librement
  const kahf = updateKnown(fullState("2026-10-05"), [18]);
  const kahfPlan = planDay(kahf, corpusFor(kahf.known, kahf.ranges));
  const kahfSpans = kahfPlan.flatMap((p) =>
    p.passages.filter(Boolean).map((x) => x.surah),
  );
  assert.ok(kahfSpans.every((s) => s === 18));
});

test("validation skips a fully deferred prayer", () => {
  let state = updateKnown(fullState("2026-10-05"), [67]);
  state = {
    ...state,
    day: {
      ...state.day,
      extras: [
        {
          id: "extra-q",
          name: "Qiyam/Tahajjud",
          after: "witr",
          limit: 1,
          rakaat: 2,
        },
      ],
    },
  };
  const corpus = corpusFor(state.known, state.ranges);
  for (const id of [
    "fajr",
    "subh",
    "dhuhr",
    "asr",
    "maghrib",
    "isha",
    "chafaa",
  ])
    state = recordPrayer(state, corpus, id, "done");
  // Witr est entièrement reporté (Al-Mulk garde son intégrité) : la
  // validation passe directement à la prière suivante
  assert.throws(() => recordPrayer(state, corpus, "witr", "done"));
  const after = recordPrayer(state, corpus, "extra-q", "done");
  assert.ok(after.day.results["extra-q"]);
});

test("juz boundaries are 30 ordered starts taken from Quran.com", () => {
  const { starts } = juzData;
  assert.equal(starts.length, 30);
  assert.deepEqual(starts[0], [1, 1]);
  assert.deepEqual(starts[6], [5, 82]);
  assert.deepEqual(starts[29], [78, 1]);
  for (let i = 1; i < starts.length; i++) {
    const [s0, v0] = starts[i - 1];
    const [s1, v1] = starts[i];
    assert.ok(s1 > s0 || (s1 === s0 && v1 > v0));
    assert.ok(v1 <= chapters[s1 - 1].verses.length);
  }
});

test("juz coverage follows the learned verses, split at juz limits", () => {
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(juzCoverage(chapters, []).every((c) => c === 0));
  const amma = Array.from({ length: 37 }, (_, i) => 78 + i);
  const ammaCov = juzCoverage(chapters, amma);
  assert.ok(close(ammaCov[29], 1));
  assert.ok(ammaCov.slice(0, 29).every((c) => c === 0));
  assert.equal(learnedJuz(chapters, amma), 1);
  const kahf = juzCoverage(chapters, [18]);
  assert.ok(kahf[14] > 0 && kahf[14] < 1);
  assert.ok(kahf[15] > 0 && kahf[15] < 1);
  assert.equal(learnedJuz(chapters, [18]), 0);
  const half = juzCoverage(chapters, [18], { 18: { from: 75, to: 110 } });
  assert.equal(half[14], 0);
  assert.ok(close(half[15], kahf[15]));
  assert.equal(
    learnedJuz(
      chapters,
      chapters.map((c) => c.id),
    ),
    30,
  );
});
