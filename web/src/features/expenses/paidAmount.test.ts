import { describe, expect, it } from 'vitest'
import { resolvePaidAmount } from './paidAmount'

describe('resolvePaidAmount', () => {
  it('is $0 when the expense is not paid, regardless of entered amounts', () => {
    expect(resolvePaidAmount(false, 0, 100)).toBe(0)
    expect(resolvePaidAmount(false, 80, 100)).toBe(0)
  })

  it('defaults a paid expense to fully paid when amount-paid is untouched (0)', () => {
    // The regression: paid + untouched must record the full amount, not $0.
    expect(resolvePaidAmount(true, 0, 100)).toBe(100)
  })

  it('preserves a positive partial payment', () => {
    expect(resolvePaidAmount(true, 60, 100)).toBe(60)
  })

  it('is $0 for a paid expense whose amount is also $0', () => {
    expect(resolvePaidAmount(true, 0, 0)).toBe(0)
  })
})
