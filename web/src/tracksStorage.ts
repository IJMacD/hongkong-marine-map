import type { Track } from "./tracksTypes";

const DB_NAME = "hk-marine";
const DB_VERSION = 1;
const STORE = "tracks";
const VISIBLE_KEY = "hk-marine-tracks-visible";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB"));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.source === "string" &&
    typeof row.importedAt === "number" &&
    Array.isArray(row.segments)
  );
}

export async function loadTracks(): Promise<Track[]> {
  const rows = await withStore<unknown[]>("readonly", (store) => store.getAll());
  return (rows ?? []).filter(isTrack).sort((a, b) => a.importedAt - b.importedAt);
}

export async function putTracks(tracks: Track[]): Promise<void> {
  if (tracks.length === 0) return;
  await withStore("readwrite", (store) => {
    for (const track of tracks) store.put(track);
  });
}

export async function deleteTrack(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

export async function renameTrack(id: string, name: string): Promise<void> {
  await withStore("readwrite", (store) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const track = request.result as unknown;
      if (isTrack(track)) store.put({ ...track, name });
    };
  });
}

export function loadVisibleTrackIds(): string[] {
  try {
    const raw = localStorage.getItem(VISIBLE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveVisibleTrackIds(ids: string[]): void {
  try {
    localStorage.setItem(VISIBLE_KEY, JSON.stringify(ids));
  } catch (err) {
    console.error(err);
  }
}
