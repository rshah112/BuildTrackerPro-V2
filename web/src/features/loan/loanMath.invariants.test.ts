// Invariant checks for the interest projection, written to catch the class of bug that the
// example-based tests in loanMath.test.ts miss: numbers that look plausible but are wrong.
// Each test verifies the implementation against an INDEPENDENT calculation rather than
// against another number produced by the same code path.

import { describe, expect, it } from 'vitest'
import { dayCountFraction, interestAccruedToDate, projectInterest } from './loanMath'

// The live baseline: $1.5M facility, 6%, 15-month interest-only term.
const loan = {
  totalAmount: 1_500_000,
  interestRate: 6,
  startDate: '2026-09-01',
  termMonths: 15,
  interestBasis: 'actual/365',
}

describe('interest projection invariants', () => {
  it('matches the closed form P·r·t when the facility is drawn in full on day one', () => {
    const p = projectInterest(loan, [{ amount: 1_500_000, drawDate: '2026-09-01' }], new Date(2026, 8, 1))
    // Sep 1 2026 → Dec 1 2027. Rounded because the raw millisecond division is 456.04 across
    // the DST boundary — the same rounding the day-count helper applies.
    const days = Math.round((new Date(2027, 11, 1).getTime() - new Date(2026, 8, 1).getTime()) / 86_400_000)
    const closedForm = 1_500_000 * 0.06 * (days / 365)
    // Regression guard: averaging opening/closing balance for RECORDED draws (rather than
    // accruing day-exactly from the draw date) understated this by $3,698 — half of the
    // first month — and made the schedule disagree with interestAccruedToDate.
    expect(Math.abs(p.totalInterest - closedForm)).toBeLessThan(1)
  })

  it('agrees with interestAccruedToDate over the months that have fully elapsed', () => {
    const draws = [
      { amount: 250_000, drawDate: '2026-09-15' },
      { amount: 400_000, drawDate: '2026-11-02' },
    ]
    const today = new Date(2027, 0, 1) // exactly 4 whole months into the term
    const p = projectInterest(loan, draws, today)
    const scheduled = p.months
      .filter((m) => m.actual)
      .reduce((total, m) => total + Math.round(m.interest * 100), 0)
    // Elapsed months carry only recorded draws, so the schedule and the day-count-exact
    // accrual must be the same money — within a cent of rounding per month.
    expect(Math.abs(scheduled / 100 - interestAccruedToDate(draws, 6, today))).toBeLessThan(0.05)
  })

  it('monthly interest sums exactly to the reported total under both conventions', () => {
    for (const interestBasis of ['actual/365', '30/360']) {
      const p = projectInterest({ ...loan, interestBasis }, [{ amount: 250_000, drawDate: '2026-09-15' }], new Date(2026, 9, 5))
      const summed = p.months.reduce((total, m) => total + Math.round(m.interest * 100), 0) / 100
      expect(summed).toBe(p.totalInterest)
    }
  })

  it('an evenly-ramped facility costs about half a fully-drawn one', () => {
    const ramped = projectInterest(loan, [], new Date(2026, 8, 1))
    const full = projectInterest(loan, [{ amount: 1_500_000, drawDate: '2026-09-01' }], new Date(2026, 8, 1))
    expect(ramped.totalInterest).toBeGreaterThan(full.totalInterest * 0.45)
    expect(ramped.totalInterest).toBeLessThan(full.totalInterest * 0.55)
  })

  it('the balance never decreases and never exceeds the facility', () => {
    const p = projectInterest(loan, [{ amount: 400_000, drawDate: '2026-10-02' }], new Date(2026, 10, 1))
    let previous = 0
    for (const m of p.months) {
      expect(m.closingBalance).toBeGreaterThanOrEqual(previous)
      expect(m.closingBalance).toBeLessThanOrEqual(1_500_000)
      previous = m.closingBalance
    }
    expect(p.months[14].closingBalance).toBe(1_500_000)
  })

  it('handles leap days and month-end start dates', () => {
    expect(dayCountFraction('2028-02-01', '2028-03-01')).toBeCloseTo(29 / 365, 10)
    const p = projectInterest({ ...loan, startDate: '2026-01-31' }, [], new Date(2026, 0, 31))
    // Month-end arithmetic clamps instead of rolling forward into the next month.
    expect(p.months.map((m) => m.monthStart).slice(0, 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('a future-dated draw accrues nothing yet', () => {
    expect(interestAccruedToDate([{ amount: 100_000, drawDate: '2027-01-01' }], 6, new Date(2026, 6, 24))).toBe(0)
  })
})
