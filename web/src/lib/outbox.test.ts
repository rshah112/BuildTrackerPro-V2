import { beforeEach, describe, expect, it } from 'vitest'
import {
  bindOutboxUser,
  enqueue,
  flush,
  needsAttentionCount,
  pendingCount,
  pendingForTable,
  retryNeedsAttention,
  setOutboxStore,
  unresolvedCount,
  type ApplyResult,
  type OutboxOp,
} from './outbox'

// Account-scoped in-memory store standing in for IndexedDB.
function memoryStore() {
  const saved = new Map<string, OutboxOp[]>()
  const clone = (ops: OutboxOp[]) => ops.map((op) => ({ ...op }))
  return {
    async load(userId: string) {
      return clone(saved.get(userId) ?? [])
    },
    async save(userId: string, next: OutboxOp[]) {
      saved.set(userId, clone(next))
    },
    async update(userId: string, updater: (current: OutboxOp[]) => OutboxOp[]) {
      const next = updater(clone(saved.get(userId) ?? []))
      saved.set(userId, clone(next))
      return clone(next)
    },
    async clear(userId: string) {
      saved.delete(userId)
    },
    peek(userId = 'user-1') {
      return clone(saved.get(userId) ?? [])
    },
  }
}

let store: ReturnType<typeof memoryStore>
beforeEach(async () => {
  store = memoryStore()
  setOutboxStore(store)
  await bindOutboxUser('user-1')
})

describe('outbox enqueue and persistence', () => {
  it('does not report success until the account-owned operation is durable', async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'x1', payload: { amount: 10 } })

    expect(pendingCount()).toBe(1)
    expect(store.peek()).toHaveLength(1)
    expect(store.peek()[0]).toMatchObject({
      userId: 'user-1',
      table: 'expenses',
      kind: 'create',
      id: 'x1',
      state: 'pending',
    })
  })

  it('rejects enqueue when durable persistence fails', async () => {
    const failing = memoryStore()
    failing.update = async () => {
      throw new Error('quota exceeded')
    }
    setOutboxStore(failing)
    await bindOutboxUser('user-1')

    await expect(enqueue({ kind: 'create', table: 'expenses', id: 'x1' })).rejects.toThrow('quota exceeded')
    expect(pendingCount()).toBe(0)
    expect(failing.peek()).toHaveLength(0)
  })

  it('isolates queues between authenticated users', async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'u1-expense' })
    await bindOutboxUser('user-2')
    expect(unresolvedCount()).toBe(0)
    await enqueue({ kind: 'create', table: 'vendors', id: 'u2-vendor' })

    await bindOutboxUser('user-1')
    expect(pendingForTable('expenses').map((op) => op.id)).toEqual(['u1-expense'])
    expect(pendingForTable('vendors')).toEqual([])
    expect(store.peek('user-2').map((op) => op.id)).toEqual(['u2-vendor'])
  })

  it('returns only the selected table in FIFO order', async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'e1' })
    await enqueue({ kind: 'create', table: 'vendors', id: 'v1' })
    await enqueue({ kind: 'update', table: 'expenses', id: 'e1', payload: { amount: 5 } })

    expect(pendingForTable('expenses').map((op) => op.id)).toEqual(['e1', 'e1'])
    expect(pendingForTable('vendors').map((op) => op.id)).toEqual(['v1'])
  })
})

describe('flush', () => {
  it('replays FIFO and removes only operations the server accepts', async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    await enqueue({ kind: 'update', table: 'expenses', id: 'a', payload: { amount: 5 } })
    const seen: string[] = []

    const result = await flush(async (op) => {
      seen.push(`${op.kind}:${op.id}`)
      return 'done'
    })

    expect(seen).toEqual(['create:a', 'update:a'])
    expect(result).toEqual({ flushed: 2, remaining: 0, needsAttention: 0 })
    expect(store.peek()).toEqual([])
  })

  it('stops at a transient failure and preserves FIFO order', async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    await enqueue({ kind: 'create', table: 'expenses', id: 'b' })
    await enqueue({ kind: 'create', table: 'expenses', id: 'c' })
    let attempts = 0

    const result = await flush(async (): Promise<ApplyResult> => {
      attempts++
      return attempts === 1 ? 'done' : { status: 'retry', message: 'HTTP 503' }
    })

    expect(result).toEqual({ flushed: 1, remaining: 2, needsAttention: 0 })
    expect(pendingForTable('expenses').map((op) => op.id)).toEqual(['b', 'c'])
    expect(store.peek()[0]).toMatchObject({ tries: 1, lastError: 'HTTP 503', state: 'pending' })
  })

  it("treats 'already' as a successful idempotent replay", async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    const result = await flush(async () => 'already')

    expect(result).toEqual({ flushed: 1, remaining: 0, needsAttention: 0 })
    expect(pendingCount()).toBe(0)
  })

  it('persists a permanent rejection as needs-attention and does not skip ahead', async () => {
    await enqueue({ kind: 'update', table: 'expenses', id: 'bad', payload: {} })
    await enqueue({ kind: 'create', table: 'expenses', id: 'later' })
    const applied: string[] = []

    const result = await flush(async (op): Promise<ApplyResult> => {
      applied.push(op.id)
      return op.id === 'bad' ? { status: 'rejected', message: 'RLS denied' } : 'done'
    })

    expect(applied).toEqual(['bad'])
    expect(result).toEqual({ flushed: 0, remaining: 2, needsAttention: 1 })
    expect(needsAttentionCount()).toBe(1)
    expect(store.peek()[0]).toMatchObject({ id: 'bad', state: 'needs_attention', lastError: 'RLS denied' })
    expect(store.peek()[1]).toMatchObject({ id: 'later', state: 'pending' })
  })

  it("retains the legacy 'fatal' result instead of dropping data", async () => {
    await enqueue({ kind: 'update', table: 'expenses', id: 'bad', payload: {} })
    const result = await flush(async () => 'fatal')

    expect(result).toEqual({ flushed: 0, remaining: 1, needsAttention: 1 })
    expect(store.peek()[0]).toMatchObject({ id: 'bad', state: 'needs_attention' })
  })

  it('requires an explicit retry before a needs-attention operation replays', async () => {
    await enqueue({ kind: 'update', table: 'expenses', id: 'a', payload: {} })
    await flush(async () => ({ status: 'rejected', message: 'constraint' }))
    const apply = async () => 'done' as const

    expect(await flush(apply)).toEqual({ flushed: 0, remaining: 1, needsAttention: 1 })
    await retryNeedsAttention()
    expect(await flush(apply)).toEqual({ flushed: 1, remaining: 0, needsAttention: 0 })
  })

  it('maps a thrown network error to retry and keeps the operation durable', async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    const result = await flush(async () => {
      throw new TypeError('Failed to fetch')
    })

    expect(result).toEqual({ flushed: 0, remaining: 1, needsAttention: 0 })
    expect(store.peek()[0]).toMatchObject({ id: 'a', state: 'pending', tries: 1 })
  })
})
