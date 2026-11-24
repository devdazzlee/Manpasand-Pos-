/**
 * Minimal promise wrapper around IndexedDB — the till's local database.
 *
 * Stores:
 * - http_cache: last good response of every GET, so screens can render offline
 * - outbox:     changes recorded on this till that the server has not confirmed yet
 * - meta:       small key/value settings (device identity, counters)
 */

const DB_NAME = "manpasand-pos-offline"
const DB_VERSION = 1

export const STORES = {
  httpCache: "http_cache",
  outbox: "outbox",
  meta: "meta",
} as const

type StoreName = (typeof STORES)[keyof typeof STORES]

let dbPromise: Promise<IDBDatabase> | null = null

export function isIndexedDbAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

export function openDb(): Promise<IDBDatabase> {
  if (!isIndexedDbAvailable()) return Promise.reject(new Error("IndexedDB is not available"))
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORES.httpCache)) {
        db.createObjectStore(STORES.httpCache, { keyPath: "key" })
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const outbox = db.createObjectStore(STORES.outbox, { keyPath: "id" })
        outbox.createIndex("status", "status")
        outbox.createIndex("createdAt", "createdAt")
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: "key" })
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // Another tab upgraded the schema — close so it isn't blocked, reopen lazily.
      db.onversionchange = () => {
        db.close()
        dbPromise = null
      }
      resolve(db)
    }
    request.onerror = () => {
      dbPromise = null
      reject(request.error)
    }
  })
  return dbPromise
}

/**
 * Runs `fn` in one transaction and resolves only once it has committed to disk.
 * `fn` must issue its requests synchronously; the value of the returned request is
 * what this resolves with.
 */
export async function withStore<T>(
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode, { durability: "strict" } as IDBTransactionOptions)
    let result: T
    tx.oncomplete = () => resolve(result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"))
    const request = fn(tx.objectStore(store))
    if (request) {
      request.onsuccess = () => {
        result = request.result
      }
    }
  })
}

export function idbGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  return withStore(store, "readonly", (s) => s.get(key) as IDBRequest<T | undefined>)
}

export function idbPut<T>(store: StoreName, value: T): Promise<IDBValidKey> {
  return withStore(store, "readwrite", (s) => s.put(value))
}

export function idbDelete(store: StoreName, key: IDBValidKey): Promise<undefined> {
  return withStore(store, "readwrite", (s) => s.delete(key))
}

export function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return withStore(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>)
}

