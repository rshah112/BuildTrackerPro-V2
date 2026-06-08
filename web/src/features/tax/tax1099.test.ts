import { describe, it, expect } from 'vitest'
import type { Expense } from '../../domain/types'
import { vendor1099Rollup } from './tax1099'

const E = (o: Partial<Expense>) =>
  ({ id: 'e', vendorName: '', amount: 0, amountPaid: 0, isPaid: false, date: '2026-03-01', paidDate: null, ...o }) as Expense

describe('vendor1099Rollup', () => {
  it('totals cash paid per vendor in the year, merges case-insensitively, flags >= $600', () => {
    const rows = vendor1099Rollup(
      [
        E({ vendorName: 'Smith Plumbing', amount: 1000, amountPaid: 1000, isPaid: true, paidDate: '2026-02-01' }),
        E({ vendorName: 'smith plumbing', amount: 200, amountPaid: 200, isPaid: true, paidDate: '2026-05-01' }),
        E({ vendorName: 'Tiny Co', amount: 100, amountPaid: 100, isPaid: true, paidDate: '2026-04-01' }),
        E({ vendorName: 'Last Year Co', amount: 5000, amountPaid: 5000, isPaid: true, paidDate: '2025-12-31' }),
        E({ vendorName: 'Unpaid Co', amount: 9000, amountPaid: 0, isPaid: false }),
      ],
      2026,
    )
    expect(rows.map((r) => [r.vendor, r.paid, r.count, r.reportable])).toEqual([
      ['Smith Plumbing', 1200, 2, true], // 1000 + 200, merged, >= 600
      ['Tiny Co', 100, 1, false], // under threshold
    ])
    // Last Year Co (wrong year) and Unpaid Co (nothing paid) are excluded.
  })

  it('flags exactly $600 as reportable and uses effective paid (clamped) amounts', () => {
    const rows = vendor1099Rollup(
      [E({ vendorName: 'Edge', amount: 600, amountPaid: 600, isPaid: true, paidDate: '2026-01-01' })],
      2026,
    )
    expect(rows[0].reportable).toBe(true)
  })
})
