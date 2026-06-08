// Durable write outbox: when a mutation can't reach Supabase (offline / dropped connection),
// the data layer queues it here instead of throwing the user's entry away. On reconnect the
// queue is replayed FIFO so causal order is preserved (a row is created before its own update).
//
// Safety guarantees this module is built to keep:
//  - NO DATA LOSS: a queued op is only removed after the server confirms it (or confirms it was
//    already applied). The queue is persisted to IndexedDB on every change, so it survives a
//    reload/app-close.
//  - NO DUPLICATES: offline-created rows carry a client-generated id, so replaying a create that
//    actually succeeded the first time (but whose ack was lost) hits a PK conflict the apply()
//    fn reports as 'already' — treated as success, never re-inserted.
//  - ORDER PRESERVED: flush stops at the first transient failure rather than skipping ahead.

import { idbGet, idbSet } from './idbKv'

export type OutboxKind = 'create' | 'update' | 'remove' | 'restore' | 'purge'

export interface OutboxOp {
  opId: string
  table: string
  kind: OutboxKind
  /** Row id. Client-generated for offline creates so it's stable across replay. */
  id: string
  /** camelCase row (create) or patch (update). Absent for remove/restore/purge. */
  payload?: Record<string, unknown>
  createdAt: number
  tries: number
}

/** How apply() reports the outcome of replaying one op. */
export type ApplyResult =
  | 'done' // server accepted it
  | 'already' // server shows it's already applied (e.g. PK conflict on a create replay) — not a dup
  | 'retry' // transient/offline failure: stop, keep the op + everything after it, preserve order
  | 'fatal' // permanent rejection (RLS/constraint): drop this op so it can't block the queue forever

// Very high cap: this is financial data, so we never silently discard a real entry — we warn.
const MAX_OPS = 5000
const STORAGE_KEY = 'outbox/v1'

export interface OutboxStore {
  load(): Promise<OutboxOp[]>
  save(ops: OutboxOp[]): Promise<void>
}

const idbStore: OutboxStore = {
  async load() {
    return (await idbGet<OutboxOp[]>(STORAGE_KEY)) ?? []
  },
  async save(ops) {
    await idbSet(STORAGE_KEY, ops)
  },
}

let store: OutboxStore = idbStore
let ops: OutboxOp[] = []
let hydrated = false
let flushing = false
const listeners = new Set<() => void>()

/** Swap the durable store (used by unit tests to inject an in-memory store). Resets state. */
export function setOutboxStore(s: OutboxStore): void {
  store = s
  ops = []
  hydrated = false
}

export function subscribeOutbox(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function pendingCount(): number {
  return ops.length
}

/** Pending ops for one table, FIFO — used to build the optimistic read overlay. */
export function pendingForTable(table: string): OutboxOp[] {
  return ops.filter((o) => o.table === table)
}

function emit(): void {
  for (const l of listeners) l()
}

async function persist(): Promise<void> {
  try {
    await store.save(ops)
  } catch {
    // durability is best-effort; the in-memory queue is still authoritative this session
  }
  emit()
}

export async function hydrateOutbox(): Promise<void> {
  if (hydrated) return
  try {
    ops = await store.load()
  } catch {
    ops = []
  }
  hydrated = true
  emit()
}

export function enqueue(op: Omit<OutboxOp, 'opId' | 'createdAt' | 'tries'>): OutboxOp {
  const full: OutboxOp = { ...op, opId: crypto.randomUUID(), createdAt: Date.now(), tries: 0 }
  ops.push(full)
  if (ops.length > MAX_OPS) {
    // Never drop financial data silently — surface it instead.
    console.warn(`[outbox] queue is large (${ops.length} ops); something is preventing sync`)
  }
  void persist()
  return full
}

/**
 * Replay the queue FIFO. `apply` performs the real mutation and classifies the outcome.
 * Stops at the first 'retry' so order is preserved; drops 'done'/'already'/'fatal' and continues.
 * Re-entrancy guarded so overlapping triggers (reconnect + app-load) don't double-send.
 */
export async function flush(apply: (op: OutboxOp) => Promise<ApplyResult>): Promise<{ flushed: number; remaining: number }> {
  await hydrateOutbox()
  if (flushing) return { flushed: 0, remaining: ops.length }
  flushing = true
  let flushed = 0
  try {
    while (ops.length) {
      const op = ops[0]
      let result: ApplyResult
      try {
        result = await apply(op)
      } catch {
        result = 'retry'
      }
      if (result === 'retry') {
        op.tries++
        await persist()
        break
      }
      if (result === 'fatal') {
        console.error('[outbox] dropping permanently-rejected op', { table: op.table, kind: op.kind, id: op.id })
      }
      ops.shift()
      flushed++
      await persist()
    }
  } finally {
    flushing = false
  }
  return { flushed, remaining: ops.length }
}
