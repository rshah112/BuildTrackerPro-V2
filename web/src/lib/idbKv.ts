// Small promise-based IndexedDB key-value store. Unlike the original best-effort
// implementation, writes reject when durability cannot be confirmed. Financial
// mutations use this signal to keep a form open instead of claiming an offline
// change was saved when IndexedDB is unavailable, blocked, or out of quota.

const DB_NAME = 'buildtracker'
const STORE = 'kv'
const VERSION = 1

export class IndexedDbUnavailableError extends Error {
  constructor(message = 'Offline storage is unavailable. Keep this page open and try again when online.') {
    super(message)
    this.name = 'IndexedDbUnavailableError'
  }
}

function requestError(req: IDBRequest, fallback: string): Error {
  return req.error ?? new IndexedDbUnavailableError(fallback)
}

function transactionError(tx: IDBTransaction, fallback: string): Error {
  return tx.error ?? new IndexedDbUnavailableError(fallback)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false
    try {
      if (typeof indexedDB === 'undefined') {
        reject(new IndexedDbUnavailableError())
        return
      }
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
      }
      req.onsuccess = () => {
        if (settled) req.result.close()
        else {
          settled = true
          resolve(req.result)
        }
      }
      req.onerror = () => {
        if (!settled) {
          settled = true
          reject(requestError(req, 'Could not open offline storage.'))
        }
      }
      req.onblocked = () => {
        if (!settled) {
          settled = true
          reject(new IndexedDbUnavailableError('Offline storage is blocked by another app tab.'))
        }
      }
    } catch (error) {
      reject(error instanceof Error ? error : new IndexedDbUnavailableError())
    }
  })
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => reject(requestError(req, `Could not read offline storage key ${key}.`))
      tx.oncomplete = () => db.close()
      tx.onerror = () => {
        db.close()
        reject(transactionError(tx, `Could not read offline storage key ${key}.`))
      }
      tx.onabort = tx.onerror
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(value, key)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(transactionError(tx, `Could not persist offline storage key ${key}.`))
      }
      tx.onabort = tx.onerror
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}

/** Atomic read-modify-write used by the outbox so simultaneous tabs cannot overwrite
 * each other's newly queued operations. The updater must be synchronous. */
export async function idbUpdate<T>(key: string, updater: (current: T | null) => T): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      const store = tx.objectStore(STORE)
      const get = store.get(key)
      let next: T | undefined
      get.onsuccess = () => {
        try {
          next = updater((get.result as T) ?? null)
          store.put(next, key)
        } catch (error) {
          tx.abort()
          reject(error)
        }
      }
      get.onerror = () => {
        tx.abort()
        reject(requestError(get, `Could not update offline storage key ${key}.`))
      }
      tx.oncomplete = () => {
        db.close()
        if (next === undefined) reject(new IndexedDbUnavailableError(`Could not update offline storage key ${key}.`))
        else resolve(next)
      }
      tx.onerror = () => {
        db.close()
        reject(transactionError(tx, `Could not update offline storage key ${key}.`))
      }
      tx.onabort = () => {
        db.close()
        reject(transactionError(tx, `Could not update offline storage key ${key}.`))
      }
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(key)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(transactionError(tx, `Could not delete offline storage key ${key}.`))
      }
      tx.onabort = tx.onerror
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}

/** Clear all app-owned IndexedDB data on logout. Static PWA assets live in CacheStorage,
 * not this database. */
export async function idbClear(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).clear()
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(transactionError(tx, 'Could not clear offline storage.'))
      }
      tx.onabort = tx.onerror
    } catch (error) {
      db.close()
      reject(error)
    }
  })
}
