import test from "node:test";
import assert from "node:assert/strict";
import { newState, updateKnown } from "../src/planner.js";
import {
  SYNC_KEY,
  decideFirstSync,
  decideRefresh,
  isEmptyState,
  loadSyncMeta,
  saveSyncMeta,
  clearSyncMeta,
} from "../src/sync.js";

const filledState = () => updateKnown(newState(), [112, 113]);
const remote = (updated_at = "2026-10-28T10:00:00.000Z") => ({
  state: updateKnown(newState(), [78, 79]),
  updated_at,
});
const emptyRemote = (updated_at = "2026-10-28T10:00:00.000Z") => ({
  state: newState(),
  updated_at,
});
const meta = (updatedAt, syncedAt) => ({ updatedAt, syncedAt });

test("isEmptyState distingue un state neuf d'un state utilisé", () => {
  assert.equal(isEmptyState(newState()), true);
  assert.equal(isEmptyState(filledState()), false);
});

test("première sync : base distante vide, on envoie le local", () => {
  assert.equal(decideFirstSync(filledState(), null), "upload");
});

test("première sync : une ligne distante au state vide compte comme une base vide", () => {
  assert.equal(decideFirstSync(filledState(), emptyRemote()), "upload");
});

test("première sync : rien des deux côtés, rien à faire", () => {
  assert.equal(decideFirstSync(newState(), null), "none");
  assert.equal(decideFirstSync(newState(), emptyRemote()), "none");
});

test("première sync : local vide et distante remplie, on télécharge", () => {
  assert.equal(decideFirstSync(newState(), remote()), "download");
});

test("première sync : données différentes des deux côtés, on demande au user", () => {
  assert.equal(decideFirstSync(filledState(), remote()), "ask");
});

test("première sync : contenu identique des deux côtés, le compte fait foi sans demander", () => {
  const local = filledState();
  const same = { state: structuredClone(local), updated_at: "2026-10-28T10:00:00.000Z" };
  assert.equal(decideFirstSync(local, same), "download");
});

test("première sync : l'ordre des clés jsonb ne compte pas comme une différence", () => {
  const local = filledState();
  const shuffled = {
    state: {
      day: local.day,
      history: local.history,
      epoch: local.epoch,
      cycles: local.cycles,
      cursor: local.cursor,
      rakaatOverrides: local.rakaatOverrides,
      prayersEnabled: local.prayersEnabled,
      limits: local.limits,
      ranges: local.ranges,
      known: local.known,
      version: local.version,
    },
    updated_at: "2026-10-28T10:00:00.000Z",
  };
  assert.equal(decideFirstSync(local, shuffled), "download");
});

test("première sync : un rollover quotidien ne compte pas comme une différence", () => {
  const local = filledState();
  const rolled = {
    ...structuredClone(local),
    day: { date: "2026-10-29", extras: [], results: {}, limitOverrides: {} },
  };
  const same = { state: local, updated_at: "2026-10-28T10:00:00.000Z" };
  assert.equal(decideFirstSync(rolled, same), "download");
});

test("refresh : distant plus récent que la dernière sync, on télécharge", () => {
  const m = meta("2026-10-28T09:00:00.000Z", "2026-10-28T09:00:00.000Z");
  assert.equal(decideRefresh(m, remote("2026-10-28T10:00:00.000Z")), "download");
});

test("refresh : local modifié depuis la dernière sync, on envoie", () => {
  const m = meta("2026-10-28T11:00:00.000Z", "2026-10-28T09:00:00.000Z");
  assert.equal(decideRefresh(m, remote("2026-10-28T09:00:00.000Z")), "upload");
});

test("refresh : conflit, le timestamp le plus récent gagne", () => {
  const localNewer = meta("2026-10-28T12:00:00.000Z", "2026-10-28T09:00:00.000Z");
  assert.equal(
    decideRefresh(localNewer, remote("2026-10-28T10:00:00.000Z")),
    "upload",
  );
  const remoteNewer = meta("2026-10-28T09:30:00.000Z", "2026-10-28T09:00:00.000Z");
  assert.equal(
    decideRefresh(remoteNewer, remote("2026-10-28T10:00:00.000Z")),
    "download",
  );
});

test("refresh : rien à faire quand tout est déjà synchronisé", () => {
  const m = meta("2026-10-28T09:00:00.000Z", "2026-10-28T10:00:00.000Z");
  assert.equal(decideRefresh(m, remote("2026-10-28T10:00:00.000Z")), "none");
});

test("refresh : ligne distante absente, on renvoie si le local a changé", () => {
  const dirty = meta("2026-10-28T11:00:00.000Z", "2026-10-28T09:00:00.000Z");
  assert.equal(decideRefresh(dirty, null), "upload");
  const clean = meta("2026-10-28T09:00:00.000Z", "2026-10-28T09:00:00.000Z");
  assert.equal(decideRefresh(clean, null), "none");
});

test("la meta de sync survit à un aller-retour localStorage", () => {
  const store = new Map();
  const storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  assert.equal(loadSyncMeta(storage), null);
  const m = meta("2026-10-28T09:00:00.000Z", "2026-10-28T09:00:00.000Z");
  saveSyncMeta(storage, m);
  assert.deepEqual(loadSyncMeta(storage), m);
  clearSyncMeta(storage);
  assert.equal(loadSyncMeta(storage), null);
  assert.equal(storage.getItem(SYNC_KEY), null);
});

test("une meta corrompue est traitée comme une absence de meta", () => {
  const storage = { getItem: () => "pas-du-json" };
  assert.equal(loadSyncMeta(storage), null);
});
