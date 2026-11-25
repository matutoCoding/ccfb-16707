// 极简 IndexedDB 封装：projects / patterns / kv 三个 object store
const DB_NAME = 'caihua-studio-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('patterns')) db.createObjectStore('patterns', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const idb = {
  async getAll<T>(store: string): Promise<T[]> {
    return tx(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
  },
  async get<T>(store: string, key: string): Promise<T | undefined> {
    return tx(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  },
  async put(store: string, value: unknown): Promise<IDBValidKey> {
    return tx(store, 'readwrite', (s) => s.put(value));
  },
  async delete(store: string, key: string): Promise<void> {
    await tx(store, 'readwrite', (s) => s.delete(key));
  },
  async getKV<T>(key: string): Promise<T | undefined> {
    const row = await tx<{ key: string; value: T } | undefined>('kv', 'readonly', (s) =>
      s.get(key) as IDBRequest<{ key: string; value: T } | undefined>,
    );
    return row?.value;
  },
  async setKV(key: string, value: unknown): Promise<void> {
    await tx('kv', 'readwrite', (s) => s.put({ key, value }));
  },
};
