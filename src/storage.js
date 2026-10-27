import {
  PRAYERS,
  buildCorpus,
  isValidRange,
  newState,
  rollover,
} from "./planner.js";

import {
  LEGACY_SEGMENTATION_IDS,
  sectionFor,
  sectionsForSurah,
} from "./sections.js";

export const STORAGE_KEY = "wird.progress.v1";
const integer = (value, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isInteger(value) && value >= min && value <= max;
const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const validId = (id) =>
  PRAYERS.some((p) => p.id === id) || /^extra-[a-zA-Z0-9-]{1,64}$/.test(id);

export function validateState(value, chapters) {
  const fail = () => {
    throw new Error(
      "Sauvegarde invalide ou incompatible. Tes données actuelles n’ont pas été remplacées.",
    );
  };
  if (object(value) && value.version === 1) {
    if ("ranges" in value) fail();
    value = { ...value, version: 2, ranges: {} };
  }
  if (
    !object(value) ||
    value.version !== 2 ||
    !Array.isArray(value.known) ||
    value.known.length > 114
  )
    fail();
  if (
    value.known.some(
      (n, i) => !integer(n, 1, 114) || (i && value.known[i - 1] >= n),
    )
  )
    fail();
  if (!object(value.ranges)) fail();
  for (const [id, range] of Object.entries(value.ranges)) {
    const chapter = chapters[Number(id) - 1];
    if (
      !chapter ||
      String(chapter.id) !== id ||
      !value.known.includes(chapter.id) ||
      !isValidRange(range, chapter.verses.length)
    )
      fail();
  }
  const prayerDefaults = {
    fajr: true,
    duha: false,
    "avant-dhuhr": false,
    "apres-dhuhr": false,
    "apres-maghrib": false,
    "apres-isha": false,
    chafaa: true,
    witr: true,
    qiyam: false,
  };
  if (value.prayersEnabled === undefined) {
    value = { ...value, prayersEnabled: prayerDefaults };
  } else if (!object(value.prayersEnabled)) fail();
  else {
    const merged = { ...prayerDefaults, ...value.prayersEnabled };
    if (
      Object.keys(prayerDefaults).some((id) => typeof merged[id] !== "boolean")
    )
      fail();
    value = { ...value, prayersEnabled: merged };
  }
  const corpus = buildCorpus(chapters, value.known, value.ranges);
  if (
    !integer(value.cursor, 0, Math.max(0, corpus.length - 1)) ||
    !integer(value.cycles) ||
    !integer(value.epoch)
  )
    fail();
  if (!object(value.limits)) fail();
  const limits = {};
  for (const p of PRAYERS) {
    const limit = value.limits[p.id] ?? 0.5;
    if (![0.25, 0.5, 1].includes(limit)) fail();
    limits[p.id] = limit;
  }
  value = { ...value, limits };
  if (
    !object(value.day) ||
    !validDate(value.day.date) ||
    !Array.isArray(value.day.extras) ||
    value.day.extras.length > 20 ||
    !object(value.day.results)
  )
    fail();
  const ids = new Set(PRAYERS.map((p) => p.id));
  if (value.day.limitOverrides === undefined)
    value.day = { ...value.day, limitOverrides: {} };
  else {
    if (!object(value.day.limitOverrides)) fail();
    for (const [id, limit] of Object.entries(value.day.limitOverrides)) {
      if (!ids.has(id) || ![0.25, 0.5, 1].includes(limit)) fail();
    }
  }
  for (const extra of value.day.extras) {
    if (
      !object(extra) ||
      typeof extra.id !== "string" ||
      !validId(extra.id) ||
      ids.has(extra.id) ||
      typeof extra.name !== "string" ||
      !extra.name.trim() ||
      extra.name.length > 40 ||
      !integer(extra.rakaat, 1, 12) ||
      ![0.25, 0.5, 1].includes(extra.limit) ||
      (extra.after !== null && !PRAYERS.some((p) => p.id === extra.after))
    )
      fail();
    ids.add(extra.id);
  }
  function checkResult(result) {
    if (
      !object(result) ||
      !["done", "skipped"].includes(result.status) ||
      !Array.isArray(result.passages) ||
      result.passages.length > 12
    )
      fail();
    if (result.status === "skipped" && result.passages.length) fail();
    if (
      result.status === "done" &&
      !result.passages.some((p) => p && !p.blocked)
    )
      fail();
    for (const passage of result.passages) {
      if (passage === null) continue;
      if (!object(passage) || !integer(passage.surah, 2, 114)) fail();
      const count = chapters[passage.surah - 1].verses.length;
      if (passage.blocked === true) {
        if (!integer(passage.verse, 1, count)) fail();
        if (
          "reason" in passage &&
          (sectionsForSurah(passage.surah) === null ||
            !["start", "end", "limit"].includes(passage.reason) ||
            !integer(passage.requiredFrom, 1, passage.verse) ||
            !integer(passage.requiredTo, passage.verse, count))
        )
          fail();
      } else if (
        !integer(passage.from, 1, count) ||
        !integer(passage.to, passage.from, count) ||
        !integer(passage.page, 1, 604) ||
        !integer(passage.endPage, passage.page, 604) ||
        !integer(passage.cycle, 1) ||
        typeof passage.size !== "number" ||
        !(passage.size > 0) ||
        // 1,5 page max : plafond 1 page + tolérance de 50 % pour finir un
        // thème. Les overrides manuels restent libres.
        (passage.size > 1.5 + 1e-9 && passage.overridden !== true)
      )
        fail();
      if ("overridden" in passage && typeof passage.overridden !== "boolean")
        fail();
      if ("segmentation" in passage) {
        const current = sectionsForSurah(passage.surah)?.id;
        if (passage.segmentation === current) {
          const first = sectionFor(passage.surah, passage.from);
          const last = sectionFor(passage.surah, passage.to);
          if (
            passage.blocked ||
            !first ||
            !last ||
            (first !== last && passage.to !== last.to)
          )
            fail();
        } else if (
          passage.blocked ||
          !LEGACY_SEGMENTATION_IDS.includes(passage.segmentation)
        )
          fail();
      }
    }
  }
  for (const [id, result] of Object.entries(value.day.results)) {
    if (!ids.has(id)) fail();
    checkResult(result);
  }
  if (!Array.isArray(value.history) || value.history.length > 100000) fail();
  for (const event of value.history) {
    checkResult(event);
    if (
      !validDate(event.date) ||
      typeof event.prayerId !== "string" ||
      !validId(event.prayerId) ||
      typeof event.name !== "string" ||
      event.name.length > 40 ||
      !integer(event.epoch, 0, value.epoch) ||
      !integer(
        event.beforeCursor,
        0,
        event.epoch === value.epoch ? Math.max(0, corpus.length - 1) : 6235,
      ) ||
      !integer(event.beforeCycles)
    )
      fail();
  }
  return value;
}

export function parseBackup(raw, chapters) {
  if (typeof raw !== "string" || raw.length > 5_000_000)
    throw new Error("Sauvegarde trop volumineuse (5 Mo maximum).");
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Ce fichier ne contient pas une sauvegarde JSON valide.");
  }
  return validateState(value, chapters);
}

export function loadState(storage, chapters) {
  const raw = storage.getItem(STORAGE_KEY);
  return {
    state: raw ? rollover(parseBackup(raw, chapters)) : newState(),
    raw,
  };
}

export function downloadBackup(state) {
  downloadText(JSON.stringify(state, null, 2), `wird-${state.day.date}.json`);
}

export function downloadText(text, filename) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
