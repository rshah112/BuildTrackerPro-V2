import { supabase } from '../lib/supabase'
import { toCamel, toSnake } from '../lib/casing'
import { isNetworkError } from '../lib/netStatus'
import { enqueue } from '../lib/outbox'
import { cacheList, readCachedList, overlayPending } from './readCache'

// Thin typed wrapper over a Supabase table: camelCase domain objects in/out, snake_case columns
// on the wire. RLS scopes every row to the owner, and `owner` defaults to auth.uid() in the
// schema, so the client never sets it.
//
// Soft-delete: `remove()` sets `deleted_at` instead of hard-deleting, `restore()` clears it, and
// `purge()` deletes for good. `list()` hides trashed rows by default; pass `{ trashed: 'only' }`
// for the Trash view.
//
// Offline: when a call can't reach Supabase (a thrown fetch/network error — NOT an RLS/constraint
// error, which comes back as { error } and is rethrown), reads fall back to the last-synced cache
// and writes are queued in the durable outbox (with a client-generated id for creates) and replayed
// on reconnect. When ONLINE and the call succeeds the behavior is identical to before — the offline
// machinery only engages on a network failure, so it can't regress the live path.

export type TrashMode = 'exclude' | 'only' | 'all'

export interface TableApi<T> {
  list(filter?: Record<string, unknown>, opts?: { trashed?: TrashMode }): Promise<T[]>
  get(id: string): Promise<T | null>
  create(input: Partial<T>): Promise<T>
  update(id: string, patch: Partial<T>): Promise<T>
  /** Soft-delete: set deleted_at = now(). */
  remove(id: string): Promise<void>
  /** Undo a soft-delete: clear deleted_at. */
  restore(id: string): Promise<void>
  /** Permanent delete (Trash → "Delete forever"). */
  purge(id: string): Promise<void>
}

export function table<T>(name: string): TableApi<T> {
  return {
    async list(filter, opts) {
      const mode = opts?.trashed ?? 'exclude'
      try {
        let q = supabase.from(name).select('*')
        if (filter) {
          const snake = toSnake<Record<string, unknown>>(filter)
          for (const [col, val] of Object.entries(snake)) {
            q = val === null ? q.is(col, null) : q.eq(col, val as never)
          }
        }
        if (mode === 'exclude') q = q.is('deleted_at', null)
        else if (mode === 'only') q = q.not('deleted_at', 'is', null)
        const { data, error } = await q
        if (error) throw error
        const rows = (data ?? []).map((row) => toCamel<T>(row))
        void cacheList(name, filter, mode, rows)
        return overlayPending(name, filter, mode, rows)
      } catch (err) {
        if (!isNetworkError(err)) throw err
        // Offline: serve the last-synced copy with any pending local changes overlaid.
        const cached = (await readCachedList<T>(name, filter, mode)) ?? []
        return overlayPending(name, filter, mode, cached)
      }
    },
    async get(id) {
      const { data, error } = await supabase.from(name).select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data ? toCamel<T>(data) : null
    },
    async create(input) {
      // Always stamp a client-generated id (the schema still defaults one, but sending it makes
      // creates IDEMPOTENT): if an insert commits server-side but its response is lost on a flaky
      // connection, the queued replay collides on the primary key (23505 → 'already') instead of
      // inserting a duplicate row.
      const row = {
        ...(input as object),
        id: (input as { id?: string }).id ?? crypto.randomUUID(),
      } as Record<string, unknown>
      try {
        const { data, error } = await supabase.from(name).insert(toSnake(row) as never).select().single()
        if (error) throw error
        return toCamel<T>(data)
      } catch (err) {
        if (!isNetworkError(err)) throw err
        // Offline: queue the insert and optimistically return the entry so the form closes and the
        // row shows in lists immediately (the stable id keeps it deduped through replay).
        enqueue({ kind: 'create', table: name, id: row.id as string, payload: row })
        return row as T
      }
    },
    async update(id, patch) {
      try {
        const { data, error } = await supabase.from(name).update(toSnake(patch) as never).eq('id', id).select().single()
        if (error) throw error
        return toCamel<T>(data)
      } catch (err) {
        if (!isNetworkError(err)) throw err
        enqueue({ kind: 'update', table: name, id, payload: patch as Record<string, unknown> })
        return { ...(patch as object), id } as T
      }
    },
    async remove(id) {
      try {
        const { error } = await supabase.from(name).update({ deleted_at: new Date().toISOString() } as never).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (!isNetworkError(err)) throw err
        enqueue({ kind: 'remove', table: name, id })
      }
    },
    async restore(id) {
      try {
        const { error } = await supabase.from(name).update({ deleted_at: null } as never).eq('id', id)
        if (error) throw error
      } catch (err) {
        if (!isNetworkError(err)) throw err
        enqueue({ kind: 'restore', table: name, id })
      }
    },
    async purge(id) {
      try {
        const { error } = await supabase.from(name).delete().eq('id', id)
        if (error) throw error
      } catch (err) {
        if (!isNetworkError(err)) throw err
        enqueue({ kind: 'purge', table: name, id })
      }
    },
  }
}
