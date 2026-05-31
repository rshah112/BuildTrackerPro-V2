import { describe, expect, it } from 'vitest'
import { availableCredit, drawnTotal, interestAccruedToDate, monthlyInterest, utilization } from './loanMath'

const draws = [
  { amount: 100_000, drawDate: '2026-01-01T00:00:00Z' },
  { amount: 50_000.5, drawDate: '2026-02-01T00:00:00Z' },
]

describe('loanMath', () => {
  it('sums drawn total cent-exactly', () => {
    expect(drawnTotal(draws)).toBe(150_000.5)
    expect(drawnTotal([])).toBe(0)
  })

  it('computes available credit and never goes negative', () => {
    expect(availableCredit(200_000, draws)).toBe(49_999.5)
    expect(availableCredit(100_000, draws)).toBe(0) // over-drawn clamps to 0
  })

  it('computes utilization 0..1', () => {
    expect(utilization(300_000, draws)).toBeCloseTo(0.5, 4) // 150000.5 / 300000
    expect(utilization(0, draws)).toBe(0)
    expect(utilization(100_000, draws)).toBe(1) // clamped
  })

  it('monthly interest = balance × rate/12 (interest-only)', () => {
    // $150,000 at 8% annual → 150000 * 0.08 / 12 = $1,000.00
    expect(monthlyInterest(150_000, 8)).toBe(1000)
    expect(monthlyInterest(150_000, 0)).toBe(0)
    expect(monthlyInterest(0, 8)).toBe(0)
  })

  it('accrues interest from each draw date to today', () => {
    // $100k drawn 100 days ago at 12.41%/yr ≈ 100000 * (0.1241/365) * 100 ≈ $3,400
    const today = new Date('2026-04-11T00:00:00Z') // 100 days after first draw
    const v = interestAccruedToDate([{ amount: 100_000, drawDate: '2026-01-01T00:00:00Z' }], 12.41, today)
    expect(v).toBeGreaterThan(3300)
    expect(v).toBeLessThan(3500)
    expect(interestAccruedToDate(draws, 0, today)).toBe(0)
  })
})
