// Durable, user-bound write outbox. A mutation is reported as saved offline only after
// IndexedDB confirms the transaction. Rejected operations remain persisted in a visible
// needs-attention state; they are never silently discarded.

import { idbDelete, idbGet, idbSet, idbUpdate } from './idbKv'

export type OutboxKind = 'create' | 'update' | 'remove' | 'restore' | 'purge'
export type OutboxState = 'pending' | 'needs_attention'

export interface OutboxOp {
  opId: string
  userId: string
  table: string
  kind: OutboxKind
  /** Row id. Client-generated for offline creates so replay is idempotent. */
  id: string
  payload?: Record<string, unknown>
  createdAt: number
  tries: number
  state: OutboxState
  lastError?: string
  lastAttemptAt?: number
}

export type ApplyStatus = 'done' | 'already' | 'retry' | 'rejected'
export type ApplyResult =
  | ApplyStatus
  | 'fatal' // legacy alias: now retained as needs_attention, never dropped
  | { status: ApplyStatus; message?: string }

const MAX_OPS = 5000
const STORAGE_PREFIX = 'outbox/v2/'
const LEGACY_STORAGE_KEY = 'outbox/v1'

const storageKey = (userId: string) => `${STORAGE_PREFIX}${encodeURIComponent(userId)}`

function newId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export interface OutboxStore {
  load(userId: string): Promise<OutboxOp[]>
  save(userId: string, next: OutboxOp[]): Promise<void>
  /** Optional atomic read-modify-write for multi-tab safety. */
  update?(userId: string, updater: (current: OutboxOp[]) => OutboxOp[]): Promise<OutboxOp[]>
  clear?(userId: string): Promise<void>
}

const idbStore: OutboxStore = {
  async load(userId) {
    return (await idbGet<OutboxOp[]>(storageKey(userId))) ?? []
  },
  async save(userId, next) {
    await idbSet(storageKey(userId), next)
  },
  async update(userId, updater) {
    return idbUpdate<OutboxOp[]>(storageKey(userId), (current) => updater(current ?? []))
  },
  async clear(userId) {
    await idbDelete(storageKey(userId))
  },
}

let store: OutboxStore = idbStore
let ops: OutboxOp[] = []
let boundUserId: string | null = null
let hydrated = false
let flushing = false
let legacyChecked = false
const listeners = new Set<() => void>()
const sourceId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())

const channel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('buildtracker-outbox-v2')
    : null

if (channel) {
  channel.onmessage = (event: MessageEvent<{ sourceId?: string; userId?: string }>) => {
    const changedUser = event.data?.userId
    if (!changedUser || event.data?.sourceId === sourceId || changedUser !== boundUserId || flushing) return
    void reloadBoundOutbox()
  }
}

function normalizeOp(op: Partial<OutboxOp>, userId: string): OutboxOp {
  return {
    opId: op.opId ?? newId(),
    userId,
    table: op.table ?? '',
    kind: op.kind ?? 'update',
    id: op.id ?? '',
    payload: op.payload,
    createdAt: op.createdAt ?? Date.now(),
    tries: op.tries ?? 0,
    state: op.state === 'needs_attention' ? 'needs_attention' : 'pending',
    lastError: op.lastError,
    lastAttemptAt: op.lastAttemptAt,
  }
}

function emit(): void {
  for (const listener of listeners) listener()
}

function broadcastChange(userId: string): void {
  channel?.postMessage({ sourceId, userId })
}

async function migrateLegacyOps(userId: string): Promise<void> {
  if (store !== idbStore || legacyChecked) return
  let legacy: Array<Partial<OutboxOp>> | null
  try {
    legacy = await idbGet<Array<Partial<OutboxOp>>>(LEGACY_STORAGE_KEY)
  } catch {
    // IndexedDB can be temporarily blocked during startup. Leave migration eligible
    // for a later bind rather than making a legacy queue disappear from view.
    return
  }
  if (!legacy?.length) {
    legacyChecked = true
    return
  }

  // V1 did not record an owner. Preserve every operation but require explicit retry so an
  // old account's payload can never be replayed automatically into the current account.
  const migrated = legacy.map((op) => ({
    ...normalizeOp(op, userId),
    state: 'needs_attention' as const,
    lastError: 'This change predates account-bound sync. Review and retry it while signed into the original account.',
  }))
  if (store.update) {
    await store.update(userId, (current) => {
      const existing = new Set(current.map((op) => op.opId))
      return [...current, ...migrated.filter((op) => !existing.has(op.opId))]
    })
  } else {
    const current = await store.load(userId)
    const existing = new Set(current.map((op) => op.opId))
    await store.save(userId, [...current, ...migrated.filter((op) => !existing.has(op.opId))])
  }
  // V2 is already durable at this point. Failure to remove the old key must not make
  // hydration fail; opId de-duplication above makes a later migration safe.
  await idbDelete(LEGACY_STORAGE_KEY).catch(() => undefined)
  legacyChecked = true
}

async function reloadBoundOutbox(): Promise<void> {
  const userId = boundUserId
  if (!userId) return
  const loaded = await store.load(userId)
  if (boundUserId !== userId) return
  ops = loaded.map((op) => normalizeOp(op, userId))
  hydrated = true
  emit()
}

async function mutateBound(updater: (current: OutboxOp[]) => OutboxOp[]): Promise<OutboxOp[]> {
  const userId = boundUserId
  if (!userId) throw new Error('Sign in before saving offline changes.')
  let next: OutboxOp[]
  if (store.update) next = await store.update(userId, (current) => updater(current.map((op) => normalizeOp(op, userId))))
  else {
    const current = await store.load(userId)
    next = updater(current.map((op) => normalizeOp(op, userId)))
    await store.save(userId, next)
  }
  if (boundUserId === userId) {
    ops = next
    hydrated = true
    emit()
  }
  broadcastChange(userId)
  return next
}

/** Bind all durable state to the authenticated user. Passing null unloads it. */
export async function bindOutboxUser(userId: string | null): Promise<void> {
  if (userId === boundUserId && hydrated) return
  boundUserId = userId
  ops = []
  hydrated = userId === null
  emit()
  if (!userId) return
  await migrateLegacyOps(userId)
  await reloadBoundOutbox()
}

export function outboxUserId(): string | null {
  return boundUserId
}

/** Test seam. Resets in-memory state and disables legacy migration for the injected store. */
export function setOutboxStore(nextStore: OutboxStore): void {
  store = nextStore
  ops = []
  boundUserId = null
  hydrated = false
  flushing = false
  legacyChecked = true
  emit()
}

export function subscribeOutbox(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function pendingCount(): number {
  return ops.filter((op) => op.state === 'pending').length
}

export function needsAttentionCount(): number {
  return ops.filter((op) => op.state === 'needs_attention').length
}

export function needsAttentionMessage(): string | null {
  return ops.find((op) => op.state === 'needs_attention')?.lastError ?? null
}

export function unresolvedCount(): number {
  return ops.length
}

/** Includes needs-attention operations so optimistic rows remain visible for review. */
export function pendingForTable(table: string): OutboxOp[] {
  return ops.filter((op) => op.table === table)
}

export async function hydrateOutbox(): Promise<void> {
  if (hydrated || !boundUserId) return
  await reloadBoundOutbox()
}

export async function enqueue(
  op: Omit<OutboxOp, 'opId' | 'userId' | 'createdAt' | 'tries' | 'state'>,
): Promise<OutboxOp> {
  const userId = boundUserId
  if (!userId) throw new Error('Offline storage is not ready for this account. Reopen the app and try again.')
  await hydrateOutbox()
  const full: OutboxOp = {
    ...op,
    opId: newId(),
    userId,
    createdAt: Date.now(),
    tries: 0,
    state: 'pending',
  }
  const next = await mutateBound((current) => [...current, full])
  if (next.length > MAX_OPS) console.warn(`[outbox] queue is large (${next.length} ops); sync needs attention`)
  return full
}

function normalizeResult(result: ApplyResult): { status: ApplyStatus; message?: string } {
  if (typeof result === 'object') return result
  if (result === 'fatal') return { status: 'rejected', message: 'The server rejected this change.' }
  return { status: result }
}

async function doFlush(
  apply: (op: OutboxOp) => Promise<ApplyResult>,
  expectedUserId: string,
): Promise<{ flushed: number; remaining: number; needsAttention: number }> {
  await hydrateOutbox()
  if (boundUserId !== expectedUserId || flushing) {
    return { flushed: 0, remaining: ops.length, needsAttention: needsAttentionCount() }
  }
  flushing = true
  let flushed = 0
  try {
    while (true) {
      await reloadBoundOutbox()
      if (boundUserId !== expectedUserId) break
      const op = ops[0]
      if (!op || op.state === 'needs_attention') break

      let result: { status: ApplyStatus; message?: string }
      try {
        result = normalizeResult(await apply(op))
      } catch (error) {
        result = { status: 'retry', message: error instanceof Error ? error.message : 'Network request failed.' }
      }

      // Auth may change while a network request is in flight. Leave the original op
      // untouched; idempotency makes replay safe when that account signs in again.
      if (boundUserId !== expectedUserId) break

      if (result.status === 'done' || result.status === 'already') {
        await mutateBound((current) => current.filter((candidate) => candidate.opId !== op.opId))
        flushed++
        continue
      }

      if (result.status === 'retry') {
        await mutateBound((current) =>
          current.map((candidate) =>
            candidate.opId === op.opId
              ? {
                  ...candidate,
                  tries: candidate.tries + 1,
                  lastAttemptAt: Date.now(),
                  lastError: result.message || 'Temporary sync failure. The app will retry.',
                }
              : candidate,
          ),
        )
        break
      }

      // Permanent/authorization/validation rejection: retain it and stop FIFO replay.
      await mutateBound((current) =>
        current.map((candidate) =>
          candidate.opId === op.opId
            ? {
                ...candidate,
                state: 'needs_attention',
                tries: candidate.tries + 1,
                lastAttemptAt: Date.now(),
                lastError: result.message || 'The server rejected this change. Review it before retrying.',
              }
            : candidate,
        ),
      )
      break
    }
  } finally {
    flushing = false
  }
  return { flushed, remaining: ops.length, needsAttention: needsAttentionCount() }
}

/** Replay FIFO. Web Locks prevents two tabs from sending the same head operation at once. */
export async function flush(
  apply: (op: OutboxOp) => Promise<ApplyResult>,
): Promise<{ flushed: number; remaining: number; needsAttention: number }> {
  const userId = boundUserId
  if (!userId) return { flushed: 0, remaining: 0, needsAttention: 0 }
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (locks) return locks.request(`buildtracker-outbox/${userId}`, () => doFlush(apply, userId))
  return doFlush(apply, userId)
}

/** Explicit user action from the sync indicator. Operations remain persisted if rejected again. */
export async function retryNeedsAttention(): Promise<void> {
  await mutateBound((current) =>
    current.map((op) => (op.state === 'needs_attention' ? { ...op, state: 'pending' as const } : op)),
  )
}

/** Explicit discard, intended for logout/recovery UI only. */
export async function discardAllOutboxChanges(): Promise<void> {
  const userId = boundUserId
  if (!userId) return
  if (store.clear) await store.clear(userId)
  else await store.save(userId, [])
  ops = []
  hydrated = true
  emit()
  broadcastChange(userId)
}

/** Drop only in-memory references after logout; persistent cleanup is handled by idbClear(). */
export function resetOutboxMemory(): void {
  boundUserId = null
  ops = []
  hydrated = true
  flushing = false
  emit()
}
