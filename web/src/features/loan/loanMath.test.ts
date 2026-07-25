import { describe, expect, it } from 'vitest'
import {
  addMonths,
  availableCredit,
  dayCountFraction,
  daysToMaturity,
  drawnTotal,
  fundedDraws,
  interestAccruedToDate,
  maturityStatus,
  monthlyInterest,
  projectInterest,
  resolvedMaturity,
  utilization,
} from './loanMath'

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

describe('draw lifecycle', () => {
  it('counts only funded draws, treating legacy rows without a status as funded', () => {
    const mixed = [
      { amount: 100_000, drawDate: '2026-01-01', status: 'funded' },
      { amount: 80_000, drawDate: '2026-02-01', status: 'approved' },
      { amount: 60_000, drawDate: '2026-03-01', status: 'requested' },
      { amount: 40_000, drawDate: '2026-04-01' }, // pre-lifecycle row
    ]
    expect(drawnTotal(fundedDraws(mixed))).toBe(140_000)
    expect(availableCredit(1_500_000, fundedDraws(mixed))).toBe(1_360_000)
  })
})

describe('day-count conventions', () => {
  it('actual/365 counts real days', () => {
    expect(dayCountFraction('2026-01-01', '2026-01-31')).toBeCloseTo(30 / 365, 10)
  })

  it('30/360 charges 30-day months on a 360-day year', () => {
    expect(dayCountFraction('2026-01-01', '2026-02-01', '30/360')).toBeCloseTo(30 / 360, 10)
    // A full year is exactly 1 under both conventions' own definitions.
    expect(dayCountFraction('2026-01-01', '2027-01-01', '30/360')).toBeCloseTo(1, 10)
  })

  it('never goes negative for a date before the draw', () => {
    expect(dayCountFraction('2026-06-01', '2026-01-01')).toBe(0)
  })

  // The two conventions are NOT uniformly ranked: 30/360 charges a fixed 30 days on a 360-day
  // year, so it costs more across short months and less across 31-day ones, and exactly the
  // same across a full year. Which one the lender uses is therefore a real input, not a detail.
  it('agrees with actual/365 across a full year', () => {
    const today = new Date(2027, 0, 1)
    const d = [{ amount: 1_000_000, drawDate: '2026-01-01' }]
    expect(interestAccruedToDate(d, 6, today, '30/360')).toBe(interestAccruedToDate(d, 6, today, 'actual/365'))
  })

  it('charges more than actual/365 across a short month, less across a long one', () => {
    expect(dayCountFraction('2026-02-01', '2026-03-01', '30/360')).toBeGreaterThan(dayCountFraction('2026-02-01', '2026-03-01'))
    expect(dayCountFraction('2026-01-01', '2026-02-01', '30/360')).toBeLessThan(dayCountFraction('2026-01-01', '2026-02-01'))
  })
})

describe('maturity', () => {
  const loan = { totalAmount: 1_500_000, interestRate: 6, startDate: '2026-09-01', termMonths: 15 }

  it('derives maturity from start + term', () => {
    expect(resolvedMaturity(loan)).toBe('2027-12-01')
  })

  it('prefers an explicit lender maturity date', () => {
    expect(resolvedMaturity({ ...loan, maturityDate: '2027-11-15' })).toBe('2027-11-15')
  })

  it('clamps month-end arithmetic instead of rolling into the next month', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonths('2027-12-31', 2)).toBe('2028-02-29') // leap year
  })

  it('is unset until the loan closes', () => {
    expect(resolvedMaturity({ totalAmount: 1_500_000, interestRate: 6 })).toBeNull()
    expect(maturityStatus({ totalAmount: 1_500_000, interestRate: 6 }, new Date(2026, 6, 24))).toBe('unset')
  })

  it('escalates as the term runs out', () => {
    expect(maturityStatus(loan, new Date(2026, 8, 2))).toBe('ok')
    expect(maturityStatus(loan, new Date(2027, 9, 1))).toBe('approaching') // ~61 days out
    expect(maturityStatus(loan, new Date(2027, 10, 20))).toBe('due') // ~11 days out
    expect(maturityStatus(loan, new Date(2028, 0, 5))).toBe('past')
    expect(daysToMaturity(loan, new Date(2027, 11, 1))).toBe(0)
  })
})

describe('projected carrying cost over the term', () => {
  // Raj's baseline: $1.5M facility, 6%, 15-month interest-only term.
  const loan = { totalAmount: 1_500_000, interestRate: 6, startDate: '2026-09-01', termMonths: 15, interestBasis: 'actual/365' }
  const today = new Date(2026, 8, 15) // mid-way through month 1

  it('produces one row per month of the term', () => {
    const p = projectInterest(loan, [{ amount: 100_000, drawDate: '2026-09-05' }], today)
    expect(p.months).toHaveLength(15)
    expect(p.months[0].monthStart).toBe('2026-09-01')
    expect(p.months[14].monthStart).toBe('2027-11-01')
  })

  it('ramps the balance to the full facility by maturity and never exceeds it', () => {
    const p = projectInterest(loan, [{ amount: 100_000, drawDate: '2026-09-05' }], today)
    expect(p.peakBalance).toBe(1_500_000)
    for (const m of p.months) expect(m.closingBalance).toBeLessThanOrEqual(1_500_000)
  })

  it('lands total interest in the right range for a ramping balance', () => {
    const p = projectInterest(loan, [{ amount: 100_000, drawDate: '2026-09-05' }], today)
    // Interest-only on a balance ramping 0 -> $1.5M over 15 months averages roughly half the
    // facility: 1.5M * 6% * 1.25yr / 2 ≈ $56k. Far below the $112.5k a fully-drawn facility costs.
    expect(p.totalInterest).toBeGreaterThan(45_000)
    expect(p.totalInterest).toBeLessThan(70_000)
    expect(p.totalInterest).toBeLessThan(1_500_000 * 0.06 * 1.25)
  })

  it('reports the peak monthly payment, not just today’s', () => {
    const p = projectInterest(loan, [{ amount: 100_000, drawDate: '2026-09-05' }], today)
    // The last full month carries ~$1.5M at 6% ≈ $7.4k/month.
    expect(p.peakMonthlyInterest).toBeGreaterThan(7_000)
    expect(p.peakMonthlyInterest).toBeLessThan(8_000)
    expect(p.peakMonthlyInterest).toBeGreaterThan(monthlyInterest(100_000, 6))
  })

  it('assumes only the undrawn remainder is still to be drawn', () => {
    const p = projectInterest(loan, [{ amount: 400_000, drawDate: '2026-09-05' }], today)
    expect(p.assumedRemainingDraws).toBe(1_100_000)
  })

  it('splits interest to date from interest still to come', () => {
    const p = projectInterest(loan, [{ amount: 100_000, drawDate: '2026-09-05' }], today)
    expect(p.interestToDate).toBeGreaterThan(0)
    expect(p.remainingInterest).toBe(Math.round((p.totalInterest - p.interestToDate) * 100) / 100)
  })

  it('degrades safely before the loan closes', () => {
    const p = projectInterest({ totalAmount: 1_500_000, interestRate: 6 }, [], new Date(2026, 6, 24))
    expect(p.months).toEqual([])
    expect(p.totalInterest).toBe(0)
    expect(p.interestToDate).toBe(0)
  })

  it('carries the day-count basis through to the projection', () => {
    const a = projectInterest(loan, [{ amount: 100_000, drawDate: '2026-09-05' }], today)
    const b = projectInterest({ ...loan, interestBasis: '30/360' }, [{ amount: 100_000, drawDate: '2026-09-05' }], today)
    expect(b.totalInterest).not.toBe(a.totalInterest)

    // On a fully-drawn (flat) balance the difference is visible cleanly: 30/360 bills a
    // uniform 30 days every month, while actual/365 charges February less than March.
    const drawnInFull = [{ amount: 1_500_000, drawDate: '2026-09-01' }]
    const flat360 = projectInterest({ ...loan, interestBasis: '30/360' }, drawnInFull, today)
    const flat365 = projectInterest(loan, drawnInFull, today)
    const february = flat365.months.findIndex((m) => m.monthStart.startsWith('2027-02'))
    expect(flat360.months[february].interest).toBe(flat360.months[february + 1].interest)
    expect(flat365.months[february].interest).toBeLessThan(flat365.months[february + 1].interest)
  })
})
