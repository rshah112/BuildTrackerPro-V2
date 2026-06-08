import { describe, it, expect, beforeEach } from 'vitest'
import { setOutboxStore, enqueue, hydrateOutbox, type OutboxOp } from '../lib/outbox'
import { overlayPending } from './readCache'

function memoryStore() {
  let saved: OutboxOp[] = []
  return {
    async load() {
      return saved.map((o) => ({ ...o }))
    },
    async save(ops: OutboxOp[]) {
      saved = ops.map((o) => ({ ...o }))
    },
  }
}

interface Row {
  id: string
  projectId: string
  amount?: number
  deletedAt?: string | null
}

beforeEach(async () => {
  setOutboxStore(memoryStore())
  await hydrateOutbox()
})

describe('overlayPending', () => {
  it('returns the base array untouched when nothing is queued (hot online path)', () => {
    const base: Row[] = [{ id: 'a', projectId: 'p1' }]
    expect(overlayPending('expenses', { projectId: 'p1' }, 'exclude', base)).toBe(base)
  })

  it('adds a pending offline create that matches the filter', () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'new', payload: { id: 'new', projectId: 'p1', amount: 50 } })
    const out = overlayPending<Row>('expenses', { projectId: 'p1' }, 'exclude', [{ id: 'a', projectId: 'p1' }])
    expect(out.map((r) => r.id).sort()).toEqual(['a', 'new'])
  })

  it('excludes a pending create from a different project (filter mismatch)', () => {
    enqueue({ kind: 'create', table: 'expenses', id: 'other', payload: { id: 'other', projectId: 'p2' } })
    const out = overlayPending<Row>('expenses', { projectId: 'p1' }, 'exclude', [{ id: 'a', projectId: 'p1' }])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })

  it('merges a pending update patch onto the matching row', () => {
    enqueue({ kind: 'update', table: 'expenses', id: 'a', payload: { amount: 999 } })
    const out = overlayPending<Row>('expenses', undefined, 'exclude', [{ id: 'a', projectId: 'p1', amount: 1 }])
    expect(out[0].amount).toBe(999)
  })

  it('hides a pending soft-delete from the default (exclude) view', () => {
    enqueue({ kind: 'remove', table: 'expenses', id: 'a' })
    const out = overlayPending<Row>('expenses', undefined, 'exclude', [{ id: 'a', projectId: 'p1' }])
    expect(out).toHaveLength(0)
  })

  it('removes a purged row entirely', () => {
    enqueue({ kind: 'purge', table: 'expenses', id: 'a' })
    const out = overlayPending<Row>('expenses', undefined, 'all', [
      { id: 'a', projectId: 'p1' },
      { id: 'b', projectId: 'p1' },
    ])
    expect(out.map((r) => r.id)).toEqual(['b'])
  })

  it('only overlays ops for the requested table', () => {
    enqueue({ kind: 'create', table: 'vendors', id: 'v', payload: { id: 'v', projectId: 'p1' } })
    const out = overlayPending<Row>('expenses', { projectId: 'p1' }, 'exclude', [{ id: 'a', projectId: 'p1' }])
    expect(out.map((r) => r.id)).toEqual(['a'])
  })
})
