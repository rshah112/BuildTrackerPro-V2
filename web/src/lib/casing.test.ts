import { describe, it, expect } from 'vitest'
import { toCamel, toSnake } from './casing'

describe('casing', () => {
  it('toCamel converts snake keys, leaves values', () => {
    expect(
      toCamel({ budget_line_item_id: 'x', photo_ids: ['a', 'b'], created_at: '2026-01-01T00:00:00Z' }),
    ).toEqual({ budgetLineItemId: 'x', photoIds: ['a', 'b'], createdAt: '2026-01-01T00:00:00Z' })
  })

  it('toSnake converts camel keys (incl. Id suffix) to clean columns', () => {
    expect(toSnake({ budgetLineItemId: 'x', photoIds: ['a'], receiptObjectKey: null })).toEqual({
      budget_line_item_id: 'x',
      photo_ids: ['a'],
      receipt_object_key: null,
    })
  })

  it('recurses arrays of objects (jsonb line items)', () => {
    expect(toCamel({ line_items: [{ id: '1', title: 't', amount: 5 }] })).toEqual({
      lineItems: [{ id: '1', title: 't', amount: 5 }],
    })
  })

  it('passes primitives and null through untouched', () => {
    expect(toCamel(null)).toBe(null)
    expect(toCamel(5)).toBe(5)
    expect(toCamel('a_b_c')).toBe('a_b_c')
  })

  it('round-trips snake -> camel -> snake', () => {
    const row = { project_id: 'p', is_allowance: true, allowance_amount: 100, vendor_id: null }
    expect(toSnake(toCamel(row))).toEqual(row)
  })
})
