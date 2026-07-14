import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bindOutboxUser, pendingForTable, setOutboxStore, type OutboxOp } from '../lib/outbox'

interface QueryResult {
  data: unknown
  error: { message: string } | null
  status?: number
}

const cannedRow = { id: '1', budget_line_item_id: 'a', amount: 5, is_paid: true }
const state: {
  lastPayload: unknown
  singleResult: QueryResult
  pages: unknown[][]
  ranges: Array<[number, number]>
} = {
  lastPayload: undefined,
  singleResult: { data: cannedRow, error: null, status: 200 },
  pages: [[]],
  ranges: [],
}

const chain: Record<string, unknown> = {}
Object.assign(chain, {
  select: vi.fn(() => chain),
  single: vi.fn(() => Promise.resolve(state.singleResult)),
  maybeSingle: vi.fn(() => Promise.resolve(state.singleResult)),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  not: vi.fn(() => chain),
  order: vi.fn(() => chain),
  range: vi.fn((from: number, to: number) => {
    state.ranges.push([from, to])
    const page = state.pages[Math.floor(from / 1000)] ?? []
    return Promise.resolve({ data: page, error: null, status: 200 })
  }),
  insert: vi.fn((value: unknown) => {
    state.lastPayload = value
    return chain
  }),
  update: vi.fn((value: unknown) => {
    state.lastPayload = value
    return chain
  }),
  delete: vi.fn(() => chain),
})

vi.mock('../lib/supabase', () => ({ supabase: { from: () => chain } }))

import { table } from './table'

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

beforeEach(async () => {
  state.lastPayload = undefined
  state.singleResult = { data: cannedRow, error: null, status: 200 }
  state.pages = [[]]
  state.ranges = []
  vi.clearAllMocks()
  setOutboxStore(memoryStore())
  await bindOutboxUser('user-1')
})

describe('table mapping', () => {
  it('create sends snake_case columns and returns a camelCase object', async () => {
    const row = await table<{ id: string; budgetLineItemId: string; amount: number; isPaid: boolean }>(
      'expenses',
    ).create({ budgetLineItemId: 'a', amount: 5, isPaid: true })

    expect(state.lastPayload).toMatchObject({ budget_line_item_id: 'a', amount: 5, is_paid: true })
    expect(typeof (state.lastPayload as { id?: string }).id).toBe('string')
    expect(row).toEqual({ id: '1', budgetLineItemId: 'a', amount: 5, isPaid: true })
  })

  it('update sends a snake_case patch', async () => {
    await table('expenses').update('1', { budgetLineItemId: 'b' } as never)
    expect(state.lastPayload).toEqual({ budget_line_item_id: 'b' })
  })

  it('fetches deterministic pages beyond the PostgREST 1,000-row cap', async () => {
    state.pages = [
      Array.from({ length: 1000 }, (_, index) => ({ id: String(index).padStart(4, '0'), project_id: 'p1' })),
      [
        { id: '1000', project_id: 'p1' },
        { id: '1001', project_id: 'p1' },
      ],
    ]

    const rows = await table<{ id: string; projectId: string }>('expenses').list({ projectId: 'p1' })

    expect(rows).toHaveLength(1002)
    expect(rows[1001]).toEqual({ id: '1001', projectId: 'p1' })
    expect(state.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(chain.order).toHaveBeenCalledTimes(2)
    expect(chain.order).toHaveBeenCalledWith('id', { ascending: true })
  })
})

describe('retryable writes', () => {
  it.each([0, 408, 429, 500, 503])('durably queues a create returned with HTTP %s', async (status) => {
    state.singleResult = { data: null, error: { message: 'temporary failure' }, status }

    const row = await table<{ id: string; amount: number }>('expenses').create({ amount: 25 })

    expect(row.amount).toBe(25)
    expect(pendingForTable('expenses')).toHaveLength(1)
    expect(pendingForTable('expenses')[0]).toMatchObject({ kind: 'create', id: row.id, state: 'pending' })
  })

  it('does not queue a permanent validation rejection', async () => {
    state.singleResult = { data: null, error: { message: 'invalid amount' }, status: 400 }

    await expect(table('expenses').create({ amount: -1 })).rejects.toMatchObject({ message: 'invalid amount' })
    expect(pendingForTable('expenses')).toEqual([])
  })
})
