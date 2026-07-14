// Offline read support for the table layer:
//  - cacheList/readCachedList persist the last successful list() result per (table, filter, mode)
//    so screens can render last-synced data with no signal instead of an empty/error state.
//  - overlayPending merges the durable outbox's pending mutations onto a base row set (cached OR
//    live) and re-applies the caller's filter + trash visibility, so a row the user just entered
//    offline shows up immediately and a row they deleted disappears — then vanishes from the
//    overlay once the real write syncs. It is a no-op (returns base untouched) when the queue is
//    empty, which is the normal online case, so the hot path is unchanged.

import { idbGet, idbSet } from '../lib/idbKv'
import { pendingForTable, unresolvedCount, type OutboxOp } from '../lib/outbox'

type TrashMode = 'exclude' | 'only' | 'all'

let boundUserId: string | null = null

/** Read caches are account-scoped. Switching users never falls back to another
 * account's rows, even while offline. */
export function bindReadCacheUser(userId: string | null): void {
  boundUserId = userId
}

function stableStringify(o: Record<string, unknown>): string {
  return JSON.stringify(
    Object.keys(o)
      .sort()
      .reduce((acc, k) => {
        acc[k] = o[k]
        return acc
      }, {} as Record<string, unknown>),
  )
}

function cacheKey(name: string, filter: Record<string, unknown> | undefined, trashed: TrashMode): string {
  if (!boundUserId) throw new Error('No authenticated cache owner.')
  return `cache/v2/${encodeURIComponent(boundUserId)}/${name}/${trashed}/${stableStringify(filter ?? {})}`
}

export async function cacheList<T>(
  name: string,
  filter: Record<string, unknown> | undefined,
  trashed: TrashMode,
  rows: T[],
): Promise<void> {
  if (!boundUserId) return
  try {
    await idbSet(cacheKey(name, filter, trashed), rows)
  } catch {
    // best-effort cache; never let it affect the live read
  }
}

export async function readCachedList<T>(
  name: string,
  filter: Record<string, unknown> | undefined,
  trashed: TrashMode,
): Promise<T[] | null> {
  if (!boundUserId) return null
  try {
    return await idbGet<T[]>(cacheKey(name, filter, trashed))
  } catch {
    return null
  }
}

function matchesFilter(row: Record<string, unknown>, filter?: Record<string, unknown>): boolean {
  if (!filter) return true
  for (const [k, v] of Object.entries(filter)) if (row[k] !== v) return false
  return true
}

function matchesTrashed(row: Record<string, unknown>, trashed: TrashMode): boolean {
  const del = (row['deletedAt'] as unknown) ?? null
  if (trashed === 'exclude') return del == null
  if (trashed === 'only') return del != null
  return true
}

function applyOverlayOp(byId: Map<string, Record<string, unknown>>, op: OutboxOp): void {
  if (op.kind === 'create') {
    if (!byId.has(op.id)) byId.set(op.id, { ...(op.payload ?? {}), id: op.id })
  } else if (op.kind === 'update') {
    const cur = byId.get(op.id)
    if (cur) Object.assign(cur, op.payload ?? {})
  } else if (op.kind === 'restore') {
    const cur = byId.get(op.id)
    if (cur) cur.deletedAt = null
  } else if (op.kind === 'remove') {
    const cur = byId.get(op.id)
    if (cur) cur.deletedAt = new Date().toISOString()
  } else if (op.kind === 'purge') {
    byId.delete(op.id)
  }
}

/** Merge pending outbox ops for `name` onto `base`, then re-apply filter + trash visibility.
 *  Returns `base` untouched when nothing is queued (the normal online path). */
export function overlayPending<T>(
  name: string,
  filter: Record<string, unknown> | undefined,
  trashed: TrashMode,
  base: T[],
): T[] {
  if (unresolvedCount() === 0) return base
  const pend = pendingForTable(name)
  if (pend.length === 0) return base
  const byId = new Map<string, Record<string, unknown>>()
  for (const r of base) byId.set((r as { id: string }).id, { ...(r as object) } as Record<string, unknown>)
  for (const op of pend) applyOverlayOp(byId, op)
  return [...byId.values()].filter((r) => matchesFilter(r, filter) && matchesTrashed(r, trashed)) as T[]
}
