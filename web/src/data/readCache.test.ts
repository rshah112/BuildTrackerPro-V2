import { beforeEach, describe, expect, it } from 'vitest'
import { bindOutboxUser, enqueue, setOutboxStore, type OutboxOp } from '../lib/outbox'
import { bindReadCacheUser, overlayPending } from './readCache'

function memoryStore() {
  const saved = new Map<string, OutboxOp[]>()
  return {
    async load(userId: string) {
      return (saved.get(userId) ?? []).map((op) => ({ ...op }))
    },
    async save(userId: string, next: OutboxOp[]) {
      saved.set(userId, next.map((op) => ({ ...op })))
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
  await bindOutboxUser('user-1')
  bindReadCacheUser('user-1')
})

describe('overlayPending', () => {
  it('returns the base array untouched when nothing is queued', () => {
    const base: Row[] = [{ id: 'a', projectId: 'p1' }]
    expect(overlayPending('expenses', { projectId: 'p1' }, 'exclude', base)).toBe(base)
  })

  it('adds a pending offline create that matches the filter', async () => {
    await enqueue({
      kind: 'create',
      table: 'expenses',
      id: 'new',
      payload: { id: 'new', projectId: 'p1', amount: 50 },
    })
    const out = overlayPending<Row>('expenses', { projectId: 'p1' }, 'exclude', [
      { id: 'a', projectId: 'p1' },
    ])
    expect(out.map((row) => row.id).sort()).toEqual(['a', 'new'])
  })

  it('excludes a pending create from a different project', async () => {
    await enqueue({ kind: 'create', table: 'expenses', id: 'other', payload: { id: 'other', projectId: 'p2' } })
    const out = overlayPending<Row>('expenses', { projectId: 'p1' }, 'exclude', [
      { id: 'a', projectId: 'p1' },
    ])
    expect(out.map((row) => row.id)).toEqual(['a'])
  })

  it('merges a pending update patch onto the matching row', async () => {
    await enqueue({ kind: 'update', table: 'expenses', id: 'a', payload: { amount: 999 } })
    const out = overlayPending<Row>('expenses', undefined, 'exclude', [
      { id: 'a', projectId: 'p1', amount: 1 },
    ])
    expect(out[0].amount).toBe(999)
  })

  it('hides a pending soft-delete from the default view', async () => {
    await enqueue({ kind: 'remove', table: 'expenses', id: 'a' })
    const out = overlayPending<Row>('expenses', undefined, 'exclude', [{ id: 'a', projectId: 'p1' }])
    expect(out).toHaveLength(0)
  })

  it('removes a purged row entirely', async () => {
    await enqueue({ kind: 'purge', table: 'expenses', id: 'a' })
    const out = overlayPending<Row>('expenses', undefined, 'all', [
      { id: 'a', projectId: 'p1' },
      { id: 'b', projectId: 'p1' },
    ])
    expect(out.map((row) => row.id)).toEqual(['b'])
  })

  it('only overlays operations for the requested table', async () => {
    await enqueue({ kind: 'create', table: 'vendors', id: 'v', payload: { id: 'v', projectId: 'p1' } })
    const out = overlayPending<Row>('expenses', { projectId: 'p1' }, 'exclude', [
      { id: 'a', projectId: 'p1' },
    ])
    expect(out.map((row) => row.id)).toEqual(['a'])
  })
})
