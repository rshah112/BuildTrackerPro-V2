import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chainable Supabase stub: records the last insert/update payload and returns a canned row.
const state: { lastPayload: unknown } = { lastPayload: undefined }
const cannedRow = { id: '1', budget_line_item_id: 'a', amount: 5, is_paid: true }

const chain: Record<string, unknown> = {}
Object.assign(chain, {
  select: vi.fn(() => chain),
  single: vi.fn(() => Promise.resolve({ data: cannedRow, error: null })),
  maybeSingle: vi.fn(() => Promise.resolve({ data: cannedRow, error: null })),
  eq: vi.fn(() => chain),
  is: vi.fn(() => chain),
  insert: vi.fn((v: unknown) => {
    state.lastPayload = v
    return chain
  }),
  update: vi.fn((v: unknown) => {
    state.lastPayload = v
    return chain
  }),
  delete: vi.fn(() => Promise.resolve({ error: null })),
})

vi.mock('../lib/supabase', () => ({ supabase: { from: () => chain } }))

import { table } from './table'

beforeEach(() => {
  state.lastPayload = undefined
})

describe('table mapping', () => {
  it('create sends snake_case columns and returns a camelCase object', async () => {
    const row = await table<{ id: string; budgetLineItemId: string; amount: number; isPaid: boolean }>(
      'expenses',
    ).create({ budgetLineItemId: 'a', amount: 5, isPaid: true })

    // A client-generated id is always sent now (so an offline/lost-ack create replay is idempotent);
    // the rest of the payload is still snake_cased.
    expect(state.lastPayload).toMatchObject({ budget_line_item_id: 'a', amount: 5, is_paid: true })
    expect(typeof (state.lastPayload as { id?: string }).id).toBe('string')
    expect(row).toEqual({ id: '1', budgetLineItemId: 'a', amount: 5, isPaid: true })
  })

  it('update sends snake_case patch', async () => {
    await table('expenses').update('1', { budgetLineItemId: 'b' } as never)
    expect(state.lastPayload).toEqual({ budget_line_item_id: 'b' })
  })
})
