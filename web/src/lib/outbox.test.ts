import { describe, it, expect, beforeEach } from 'vitest'
import {
  setOutboxStore,
  enqueue,
  flush,
  hydrateOutbox,
  pendingCount,
  pendingForTable,
  type OutboxOp,
  type ApplyResult,
} from './outbox'

// In-memory store standing in for IndexedDB.
function memoryStore() {
  let saved: OutboxOp[] = []
  return {
    async load() {
      return saved.map((o) => ({ ...o }))
    },
    async save(ops: OutboxOp[]) {
      saved = ops.map((o) => ({ ...o }))
    },
    peek: () => saved,
  }
}

let store: ReturnType<typeof memoryStore>
beforeEach(async () => {
  store = memoryStore()
  setOutboxStore(store)
  await hydrateOutbox()
})

describe('outbox enqueue + persistence', () => {
  it('enqueues and persists durably (survives a fresh hydrate)', async () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'x1', payload: { amount: 10 } })
    expect(pendingCount()).toBe(1)
    // allow the fire-and-forget persist() microtask to settle
    await Promise.resolve()
    expect(store.peek()).toHaveLength(1)
    expect(store.peek()[0]).toMatchObject({ table: 'expenses', kind: 'create', id: 'x1' })
  })

  it('pendingForTable returns only that table, in FIFO order', () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'e1' })
    enqueue({ kind: 'create', table: 'vendors', id: 'v1' })
    enqueue({ kind: 'update', table: 'expenses', id: 'e1', payload: { amount: 5 } })
    expect(pendingForTable('expenses').map((o) => o.id)).toEqual(['e1', 'e1'])
    expect(pendingForTable('vendors').map((o) => o.id)).toEqual(['v1'])
  })
})

describe('flush', () => {
  it('replays FIFO and removes every op the server accepts', async () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    enqueue({ kind: 'update', table: 'expenses', id: 'a', payload: { amount: 5 } })
    const seen: string[] = []
    const res = await flush(async (op) => {
      seen.push(`${op.kind}:${op.id}`)
      return 'done'
    })
    expect(seen).toEqual(['create:a', 'update:a']) // causal order preserved
    expect(res).toEqual({ flushed: 2, remaining: 0 })
    expect(pendingCount()).toBe(0)
  })

  it('stops at the first transient failure and keeps order (no skip-ahead)', async () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    enqueue({ kind: 'create', table: 'expenses', id: 'b' })
    enqueue({ kind: 'create', table: 'expenses', id: 'c' })
    let n = 0
    const res = await flush(async (): Promise<ApplyResult> => {
      n++
      return n === 1 ? 'done' : 'retry' // a fails-free, b is offline → stop, leave b and c
    })
    expect(res).toEqual({ flushed: 1, remaining: 2 })
    expect(pendingForTable('expenses').map((o) => o.id)).toEqual(['b', 'c'])
  })

  it("treats 'already' as success (a lost-ack create replay does not duplicate)", async () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    const res = await flush(async () => 'already')
    expect(res).toEqual({ flushed: 1, remaining: 0 })
    expect(pendingCount()).toBe(0)
  })

  it("drops a 'fatal' op and continues past it", async () => {
    enqueue({ kind: 'update', table: 'expenses', id: 'bad', payload: {} })
    enqueue({ kind: 'create', table: 'expenses', id: 'good' })
    const applied: string[] = []
    const res = await flush(async (op): Promise<ApplyResult> => {
      applied.push(op.id)
      return op.id === 'bad' ? 'fatal' : 'done'
    })
    expect(applied).toEqual(['bad', 'good'])
    expect(res).toEqual({ flushed: 2, remaining: 0 })
  })

  it('maps a thrown network error to retry (op stays queued)', async () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'a' })
    const res = await flush(async () => {
      throw new TypeError('Failed to fetch')
    })
    expect(res).toEqual({ flushed: 0, remaining: 1 })
    expect(pendingCount()).toBe(1)
  })
})
