import { describe, it, expect } from 'vitest'
import { parseAmount, parseDate, parseVendor } from './receiptOcr'

const RECEIPT = `HOME DEPOT
123 Main St
04/17/2026

Lumber 2x4      12.50
Screws           8.99
Subtotal        21.49
Tax              1.51
TOTAL          23.00
VISA ****1234`

describe('parseAmount', () => {
  it('prefers the grand total over subtotal/line items', () => {
    expect(parseAmount(RECEIPT)).toBe(23.0)
  })
  it('falls back to the largest amount when no total line', () => {
    expect(parseAmount('item a 10.00\nitem b 45.25\nitem c 5.00')).toBe(45.25)
  })
  it('returns null when there are no money-shaped values', () => {
    expect(parseAmount('no prices here')).toBeNull()
  })
  it('handles thousands separators', () => {
    expect(parseAmount('Grand Total 1,250.00')).toBe(1250)
  })
})

describe('parseDate', () => {
  it('parses mm/dd/yyyy to ISO', () => {
    expect(parseDate(RECEIPT)).toBe('2026-04-17')
  })
  it('parses ISO dates directly', () => {
    expect(parseDate('Date: 2025-12-09')).toBe('2025-12-09')
  })
  it('expands two-digit years', () => {
    expect(parseDate('1/2/26')).toBe('2026-01-02')
  })
  it('rejects impossible month/day', () => {
    expect(parseDate('99/99/99')).toBeNull()
  })
})

describe('parseVendor', () => {
  it('takes the first substantial text line', () => {
    expect(parseVendor(RECEIPT)).toBe('HOME DEPOT')
  })
  it('skips a leading date line', () => {
    expect(parseVendor('04/17/2026\nACME SUPPLY')).toBe('ACME SUPPLY')
  })
  it('returns null when nothing looks like a name', () => {
    expect(parseVendor('12.00\n34\n  ')).toBeNull()
  })
})
