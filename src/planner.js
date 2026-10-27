import juzData from "./data/juz.json" with { type: "json" };
import { sectionFor, sectionsForSurah } from "./sections.js";

export const PRAYERS = [
  {
    id: "fajr",
    name: "Fajr",
    detail: "2 rakaat",
    rakaat: 2,
    optional: true,
    icon: "sunrise",
  },
  {
    id: "subh",
    name: "Subh",
    detail: "2 rakaat",
    rakaat: 2,
    icon: "sunrise",
  },
  {
    id: "duha",
    name: "Duha",
    detail: "2 rakaat",
    rakaat: 2,
    optional: true,
    icon: "sun",
  },
  {
    id: "avant-dhuhr",
    name: "Avant Dhuhr",
    detail: "4 rakaat",
    rakaat: 2,
    optional: true,
    icon: "sun",
  },
  {
    id: "dhuhr",
    name: "Dhuhr",
    detail: "4 rakaat",
    rakaat: 2,
    icon: "sun",
  },
  {
    id: "apres-dhuhr",
    name: "Après Dhuhr",
    detail: "2 rakaat",
    rakaat: 2,
    optional: true,
    icon: "sun",
  },
  {
    id: "asr",
    name: "Asr",
    detail: "4 rakaat",
    rakaat: 2,
    icon: "sun",
  },
  {
    id: "maghrib",
    name: "Maghreb",
    detail: "3 rakaat",
    rakaat: 2,
    icon: "sunset",
  },
  {
    id: "apres-maghrib",
    name: "Après Maghreb",
    detail: "2 rakaat",
    rakaat: 2,
    optional: true,
    icon: "sunset",
  },
  {
    id: "isha",
    name: "Isha",
    detail: "4 rakaat",
    rakaat: 2,
    icon: "moon",
  },
  {
    id: "apres-isha",
    name: "Après Isha",
    detail: "2 rakaat",
    rakaat: 2,
    optional: true,
    icon: "moon",
  },
  {
    id: "chafaa",
    name: "Chafaa",
    detail: "2 rakaat",
    rakaat: 2,
    optional: true,
    icon: "moon",
  },
  {
    id: "witr",
    name: "Witr",
    detail: "1 rakaat",
    rakaat: 1,
    optional: true,
    icon: "moon",
  },
  {
    id: "qiyam",
    name: "Qiyam/Tahajjud",
    detail: "",
    rakaat: 2,
    optional: true,
    icon: "moon",
  },
];

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function newState(date = localDate()) {
  return {
    version: 2,
    known: [],
    ranges: {},
    cursor: 0,
    cycles: 0,
    epoch: 0,
    limits: Object.fromEntries(PRAYERS.map((p) => [p.id, 0.5])),
    prayersEnabled: {
      fajr: true,
      duha: false,
      "avant-dhuhr": false,
      "apres-dhuhr": false,
      "apres-maghrib": false,
      "apres-isha": false,
      chafaa: false,
      witr: true,
      qiyam: false,
    },
    day: { date, extras: [], results: {} },
    history: [],
  };
}

export function rollover(state, date = localDate()) {
  if (state.day.date === date) return state;
  return { ...state, day: { date, extras: [], results: {} } };
}

export function knownRange(chapter, ranges = {}) {
  return ranges[chapter.id] ?? { from: 1, to: chapter.verses.length };
}

export function isValidRange(range, verseCount) {
  return (
    !!range &&
    !Array.isArray(range) &&
    Number.isInteger(range.from) &&
    Number.isInteger(range.to) &&
    range.from >= 1 &&
    range.to >= range.from &&
    range.to <= verseCount
  );
}

function verseCoordinates(chapters) {
  const firstPages = new Map();
  for (const chapter of chapters.slice(0, 2)) {
    for (const [page, line, endPage, endLine] of chapter.verses) {
      if (page > 2 || endPage !== page) continue;
      const bounds = firstPages.get(page) ?? { min: line, max: endLine };
      bounds.min = Math.min(bounds.min, line);
      bounds.max = Math.max(bounds.max, endLine);
      firstPages.set(page, bounds);
    }
  }
  return (page, line, end = false) => {
    const bounds = firstPages.get(page) ?? { min: 1, max: 15 };
    return (
      page -
      1 +
      (line - bounds.min + (end ? 1 : 0)) / (bounds.max - bounds.min + 1)
    );
  };
}

export function learnedPages(chapters, known, ranges = {}) {
  const coordinate = verseCoordinates(chapters);
  return chapters
    .filter((c) => known.includes(c.id))
    .reduce((total, chapter) => {
      const range = knownRange(chapter, ranges);
      const [startPage, startLine] = chapter.verses[range.from - 1];
      const [, , endPage, endLine] = chapter.verses[range.to - 1];
      return (
        total +
        (coordinate(endPage, endLine, true) - coordinate(startPage, startLine))
      );
    }, 0);
}

// Part apprise de chaque juz (0 à 1), mesurée comme learnedPages : par
// étendue de lignes du mushaf, découpée aux limites de juz.
export function juzCoverage(chapters, known, ranges = {}) {
  const coordinate = verseCoordinates(chapters);
  const starts = juzData.starts;
  const selected = new Set(known);
  const total = Array(starts.length).fill(0);
  const learned = Array(starts.length).fill(0);
  const span = (chapter, from, to) => {
    const [startPage, startLine] = chapter.verses[from - 1];
    const [, , endPage, endLine] = chapter.verses[to - 1];
    return (
      coordinate(endPage, endLine, true) - coordinate(startPage, startLine)
    );
  };
  let juz = 0;
  for (const chapter of chapters) {
    const range = selected.has(chapter.id) ? knownRange(chapter, ranges) : null;
    const flush = (from, to) => {
      total[juz] += span(chapter, from, to);
      if (!range) return;
      const a = Math.max(from, range.from);
      const b = Math.min(to, range.to);
      if (a <= b) learned[juz] += span(chapter, a, b);
    };
    let pieceStart = 1;
    for (let verse = 1; verse <= chapter.verses.length; verse++) {
      const next = starts[juz + 1];
      if (next && next[0] === chapter.id && next[1] === verse) {
        if (verse > pieceStart) flush(pieceStart, verse - 1);
        juz++;
        pieceStart = verse;
      }
    }
    flush(pieceStart, chapter.verses.length);
  }
  return total.map((t, i) => (t ? Math.min(1, learned[i] / t) : 0));
}

// Nombre de juz entièrement appris.
export function learnedJuz(chapters, known, ranges = {}) {
  return juzCoverage(chapters, known, ranges).filter((c) => c >= 1 - 1e-9)
    .length;
}

export function buildCorpus(chapters, known, ranges = {}) {
  const selected = new Set(known);
  const coordinate = verseCoordinates(chapters);
  return chapters
    .filter((c) => c.id !== 1 && selected.has(c.id))
    .flatMap((chapter) => {
      const range = knownRange(chapter, ranges);
      return chapter.verses
        .slice(range.from - 1, range.to)
        .map(([page, line, endPage, endLine], index) => ({
          surah: chapter.id,
          verse: range.from + index,
          page,
          endPage,
          start: coordinate(page, line),
          end: coordinate(endPage, endLine, true),
        }));
    });
}

export function dailyPrayers(state, extras = state.day.extras) {
  const enabled = state.prayersEnabled ?? {};
  const asExtra = (extra) => ({
    ...extra,
    detail: `${extra.rakaat} rakaat supplémentaires · aujourd’hui`,
    icon: "spark",
    extra: true,
  });
  return [
    ...extras.filter((extra) => extra.after === null).map(asExtra),
    ...PRAYERS.filter(
      (prayer) => !prayer.optional || enabled[prayer.id] === true,
    ).flatMap((prayer) => [
      { ...prayer, limit: state.limits[prayer.id] },
      ...extras.filter((extra) => extra.after === prayer.id).map(asExtra),
    ]),
  ];
}

export function takePassage(corpus, cursor, cycles, limit) {
  if (!corpus.length) return { passage: null, cursor, cycles };
  const first = corpus[cursor];
  const section = sectionFor(first.surah, first.verse);
  if (first.end - first.start > limit + 1e-9) {
    return {
      passage: { blocked: true, surah: first.surah, verse: first.verse },
      cursor,
      cycles,
    };
  }
  let last = cursor;
  while (last + 1 < corpus.length) {
    const next = corpus[last + 1];
    if (
      next.surah !== first.surah ||
      next.end - first.start > limit + 1e-9 ||
      (section && next.verse > section.to)
    )
      break;
    last++;
  }
  if (section && corpus[last].verse === section.to) {
    const blocks = sectionsForSurah(first.surah).blocks;
    let index = blocks.findIndex(
      (b) => b.from <= first.verse && first.verse <= b.to,
    );
    while (index + 1 < blocks.length) {
      const nextBlock = blocks[index + 1];
      const blockEnd = last + (nextBlock.to - nextBlock.from + 1);
      if (
        blockEnd >= corpus.length ||
        corpus[blockEnd].surah !== first.surah ||
        corpus[blockEnd].verse !== nextBlock.to ||
        corpus[last + 1].verse !== nextBlock.from ||
        corpus[blockEnd].end - first.start > limit + 1e-9
      )
        break;
      last = blockEnd;
      index++;
    }
  }
  // Coupure au milieu d'un thème : on tolère jusqu'à 50 % de dépassement du
  // plafond pour finir le thème d'un bloc, jamais pour enchaîner au-delà.
  const stopSection = sectionFor(first.surah, corpus[last].verse);
  if (stopSection && corpus[last].verse < stopSection.to) {
    let end = last;
    while (
      end + 1 < corpus.length &&
      corpus[end + 1].surah === first.surah &&
      corpus[end + 1].verse <= stopSection.to
    )
      end++;
    if (
      corpus[end].verse === stopSection.to &&
      corpus[end].end - first.start <= limit * 1.5 + 1e-9
    )
      last = end;
  }
  const passage = {
    surah: first.surah,
    from: first.verse,
    to: corpus[last].verse,
    page: first.page,
    endPage: corpus[last].endPage,
    size: corpus[last].end - first.start,
    cycle: cycles + 1,
    ...(section ? { segmentation: sectionsForSurah(first.surah).id } : {}),
  };
  const finished = last === corpus.length - 1;
  return {
    passage,
    cursor: finished ? 0 : last + 1,
    cycles: cycles + (finished ? 1 : 0),
  };
}

function applyOverride(corpus, cursor, cycles, planned, endVerse) {
  const fail = () => {
    throw new Error("Fin de rakaat invalide pour ce passage.");
  };
  if (!Number.isInteger(endVerse) || endVerse < planned.from) fail();
  const index = cursor + (endVerse - planned.from);
  const last = corpus[index];
  if (!last || last.verse !== endVerse || last.surah !== planned.surah) fail();
  const section = sectionFor(planned.surah, planned.from);
  if (section && endVerse > section.to) fail();
  const first = corpus[cursor];
  const passage = {
    ...planned,
    to: endVerse,
    endPage: last.endPage,
    size: last.end - first.start,
    overridden: true,
  };
  const finished = index === corpus.length - 1;
  return {
    passage,
    cursor: finished ? 0 : index + 1,
    cycles: cycles + (finished ? 1 : 0),
  };
}

// Est-ce que la sourate au curseur se termine en `slots` rakaat ?
function completesInSlots(corpus, cursor, cycles, limit, slots) {
  const surah = corpus[cursor].surah;
  let cur = cursor;
  let cyc = cycles;
  for (let i = 0; i < slots; i++) {
    const next = takePassage(corpus, cur, cyc, limit);
    if (!next.passage || next.passage.blocked) return false;
    cur = next.cursor;
    cyc = next.cycles;
    if (cur === 0 || corpus[cur].surah !== surah) return true;
  }
  return false;
}

// Plus grande limite parmi les prières de 2 rakaat ou plus du programme.
// C'est la référence d'atomicité : une sourate qui tient dans une prière à
// cette limite ne doit jamais être coupée entre deux prières. Si aucune
// prière du programme ne peut la contenir entière, le report est impossible
// et on la place coupée plutôt que de bloquer le cycle.
function maxScheduleLimit(state) {
  const enabled = state.prayersEnabled ?? {};
  const limits = PRAYERS.filter(
    (p) => p.rakaat >= 2 && (!p.optional || enabled[p.id] === true),
  ).map((p) => state.limits[p.id] ?? 0.5);
  return limits.length ? Math.max(...limits) : 0;
}

export function planPrayer(
  corpus,
  cursor,
  cycles,
  prayer,
  overrides = {},
  scheduleLimit = prayer.limit,
) {
  const passages = [];
  for (let i = 0; i < prayer.rakaat; i++) {
    // Une sourate qui tient dans une prière complète de 2 rakaat à la limite
    // la plus haute du programme est atomique : si elle ne peut pas finir
    // dans les rakaat restantes de cette prière, son début est reporté à la
    // suivante et la rakaat reste vide. Une sourate plus longue traverse
    // librement.
    if (
      corpus.length &&
      (cursor === 0 || corpus[cursor - 1].surah !== corpus[cursor].surah) &&
      !completesInSlots(
        corpus,
        cursor,
        cycles,
        prayer.limit,
        prayer.rakaat - i,
      ) &&
      completesInSlots(corpus, cursor, cycles, scheduleLimit, 2)
    )
      break;
    let next = takePassage(corpus, cursor, cycles, prayer.limit);
    if (overrides[i] != null && next.passage && !next.passage.blocked) {
      next = applyOverride(corpus, cursor, cycles, next.passage, overrides[i]);
    }
    passages.push(next.passage);
    cursor = next.cursor;
    cycles = next.cycles;
  }
  return { passages, cursor, cycles };
}

export function planDay(state, corpus, activeOverrides = {}) {
  let { cursor, cycles } = state;
  const scheduleLimit = maxScheduleLimit(state);
  let active = true;
  return dailyPrayers(state).map((prayer) => {
    const result = state.day.results[prayer.id];
    if (result) return { ...prayer, result, passages: result.passages };
    const next = planPrayer(
      corpus,
      cursor,
      cycles,
      prayer,
      active ? activeOverrides : {},
      scheduleLimit,
    );
    active = false;
    cursor = next.cursor;
    cycles = next.cycles;
    return { ...prayer, passages: next.passages };
  });
}

export function recordPrayer(state, corpus, prayerId, status, overrides = {}) {
  if (!["done", "skipped"].includes(status))
    throw new Error("Validation inconnue.");
  const scheduleLimit = maxScheduleLimit(state);
  let prayer = null;
  let next = null;
  for (const p of dailyPrayers(state)) {
    if (state.day.results[p.id]) continue;
    const planned = planPrayer(
      corpus,
      state.cursor,
      state.cycles,
      p,
      status === "done" ? overrides : {},
      scheduleLimit,
    );
    // Prière entièrement reportée (sourate gardée entière) : elle ne
    // consomme rien et ne bloque pas la validation des suivantes.
    if (!planned.passages.some((x) => x)) continue;
    prayer = p;
    next = planned;
    break;
  }
  if (!prayer || prayer.id !== prayerId)
    throw new Error("Valide ou reporte d’abord la prière précédente.");
  if (status === "done" && !next.passages.some((p) => p && !p.blocked)) {
    throw new Error("Aucun passage ne peut être validé pour cette prière.");
  }
  const result = { status, passages: status === "done" ? next.passages : [] };
  return {
    ...state,
    cursor: status === "done" ? next.cursor : state.cursor,
    cycles: status === "done" ? next.cycles : state.cycles,
    day: {
      ...state.day,
      results: { ...state.day.results, [prayerId]: result },
    },
    history: [
      ...state.history,
      {
        ...result,
        date: state.day.date,
        prayerId,
        name: prayer.name,
        epoch: state.epoch,
        beforeCursor: state.cursor,
        beforeCycles: state.cycles,
      },
    ],
  };
}

export function canUndo(state) {
  const last = state.history.at(-1);
  return !!last && last.date === state.day.date && last.epoch === state.epoch;
}

export function undoLast(state) {
  if (!canUndo(state)) return state;
  const last = state.history.at(-1);
  const results = { ...state.day.results };
  delete results[last.prayerId];
  return {
    ...state,
    cursor: last.beforeCursor,
    cycles: last.beforeCycles,
    day: { ...state.day, results },
    history: state.history.slice(0, -1),
  };
}

export function updateKnown(state, known, ranges = state.ranges) {
  const sorted = [...new Set(known)].sort((a, b) => a - b);
  const selectedRanges = Object.fromEntries(
    sorted
      .filter((id) => ranges[id])
      .map((id) => [id, { from: ranges[id].from, to: ranges[id].to }]),
  );
  if (
    JSON.stringify(sorted) === JSON.stringify(state.known) &&
    JSON.stringify(selectedRanges) === JSON.stringify(state.ranges)
  )
    return state;
  return {
    ...state,
    known: sorted,
    ranges: selectedRanges,
    cursor: 0,
    epoch: state.epoch + 1,
  };
}

export function forecast(state, corpus, includeExtras = true) {
  if (!corpus.length) return null;
  let { cursor, cycles } = state;
  const target = cycles + 1;
  const today = dailyPrayers(
    state,
    includeExtras ? state.day.extras : [],
  ).filter((p) => !state.day.results[p.id]);
  const scheduleLimit = maxScheduleLimit(state);
  const regular = dailyPrayers(state, []);
  for (let day = 0; day <= corpus.length + 1; day++) {
    const before = cursor;
    for (const prayer of day === 0 ? today : regular) {
      const next = planPrayer(
        corpus,
        cursor,
        cycles,
        prayer,
        {},
        scheduleLimit,
      );
      cursor = next.cursor;
      cycles = next.cycles;
      if (cycles >= target) return { days: day + 1, dateOffset: day };
    }
    if (day > 0 && cursor === before) return { blocked: true };
  }
  return { blocked: true };
}
