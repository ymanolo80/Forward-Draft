import type { AppData } from "../types";

const DB_NAME = "forward-draft";
const STORE = "app";
const KEY = "state";

export const emptyData: AppData = {
  projects: [],
  versions: [],
  notes: [],
  highlights: [],
  tasks: [],
};

function createStoreIfMissing(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => createStoreIfMissing(request.result);
    request.onsuccess = () => {
      const db = request.result;
      if (db.objectStoreNames.contains(STORE)) {
        resolve(db);
        return;
      }
      // The database exists but is missing our object store (left in a
      // half-initialised state). Bump the version to trigger onupgradeneeded
      // and recreate the store so the cache heals itself instead of failing
      // every read.
      const nextVersion = db.version + 1;
      db.close();
      const upgrade = indexedDB.open(DB_NAME, nextVersion);
      upgrade.onupgradeneeded = () => createStoreIfMissing(upgrade.result);
      upgrade.onsuccess = () => resolve(upgrade.result);
      upgrade.onerror = () => reject(upgrade.error);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function loadData(): Promise<AppData> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result ?? emptyData);
    req.onerror = () => reject(req.error);
  });
}

export async function saveData(data: AppData): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(data, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
