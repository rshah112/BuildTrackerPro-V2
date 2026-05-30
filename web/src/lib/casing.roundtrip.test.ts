import { describe, it, expect } from 'vitest'
import { toCamel, toSnake } from './casing'

describe('casing round-trip (audit #8)', () => {
  it('round-trips real letter-only snake columns', () => {
    const snake = { budget_line_item_id: 1, vendor_name: 'a', expected_payment_date: null }
    expect(toSnake(toCamel(snake))).toEqual(snake)
  })

  it('preserves an underscore before a digit through snake->camel->snake', () => {
    // e.g. a column like address_2 must not collapse to address2
    const snake = { address_2: 'x', line_1: 'y' }
    expect(toSnake(toCamel(snake))).toEqual(snake)
  })
})
