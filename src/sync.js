// Synchronisation du state avec Supabase. Une seule ligne par utilisateur
// dans la table user_state, résolution des conflits en last-write-wins
// sur les timestamps (le plus récent gagne).

export const SYNC_KEY = "wird.sync.v1";

// Meta de sync conservée hors du state utilisateur. updatedAt : dernière
// modification locale. syncedAt : version distante avec laquelle on est
// d'accord (dernier push ou pull réussi). null quand cet appareil n'a
// jamais synchronisé.
export function loadSyncMeta(storage) {
  try {
    const raw = storage.getItem(SYNC_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (
      typeof meta?.updatedAt !== "string" ||
      typeof meta?.syncedAt !== "string"
    )
      return null;
    return meta;
  } catch {
    return null;
  }
}

export function saveSyncMeta(storage, meta) {
  storage.setItem(SYNC_KEY, JSON.stringify(meta));
}

export function clearSyncMeta(storage) {
  storage.removeItem(SYNC_KEY);
}

// Un state "vide" ne contient aucune donnée utilisateur : rien à perdre
// si l'autre version l'écrase.
export function isEmptyState(state) {
  return (
    Array.isArray(state?.known) &&
    state.known.length === 0 &&
    Array.isArray(state?.history) &&
    state.history.length === 0
  );
}

// Comparaison récursive indépendante de l'ordre des clés : jsonb ne
// garantit pas l'ordre des clés des objets stockés.
const canonical = (value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
};

// Deux states ont la "même" progression si tout est identique hors `day`
// (le rollover quotidien n'est pas une vraie différence).
export function sameProgress(a, b) {
  const strip = ({ day, ...rest } = {}) => rest;
  return (
    JSON.stringify(canonical(strip(a))) === JSON.stringify(canonical(strip(b)))
  );
}

// Première connexion d'un compte sur cet appareil. Une ligne distante qui
// contient un state vide (créée en confirmant l'email depuis un appareil
// sans données) compte comme une base vide : on envoie le local sans
// demander. On ne demande que si les deux côtés ont de vraies données qui
// divergent ; à contenu identique, le compte fait foi.
export function decideFirstSync(localState, remote) {
  const localEmpty = isEmptyState(localState);
  const remoteEmpty = !remote || isEmptyState(remote.state);
  if (remoteEmpty) return localEmpty ? "none" : "upload";
  if (localEmpty) return "download";
  return sameProgress(localState, remote.state) ? "download" : "ask";
}

// Sync suivantes : last-write-wins entre la version locale et la distante.
// meta ne doit pas être null ici (la première sync est déjà passée).
export function decideRefresh(meta, remote) {
  if (!remote) return meta.updatedAt > meta.syncedAt ? "upload" : "none";
  if (remote.updated_at > meta.syncedAt) {
    if (meta.updatedAt > meta.syncedAt && meta.updatedAt > remote.updated_at)
      return "upload";
    return "download";
  }
  if (meta.updatedAt > meta.syncedAt) return "upload";
  return "none";
}

export async function fetchRemote(client, userId) {
  const { data, error } = await client
    .from("user_state")
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function pushRemote(
  client,
  userId,
  state,
  now = new Date().toISOString(),
) {
  const { error } = await client
    .from("user_state")
    .upsert({ user_id: userId, state, updated_at: now });
  if (error) throw error;
  return now;
}
