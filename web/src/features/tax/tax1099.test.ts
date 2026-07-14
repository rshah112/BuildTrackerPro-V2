import { describe, expect, it } from 'vitest'
import type { Expense, Vendor } from '../../domain/types'
import { candidateThresholdForYear, isPaymentNetworkMethod, vendor1099Rollup } from './tax1099'

const E = (over: Partial<Expense>) =>
  ({
    id: 'e',
    projectId: 'p1',
    vendorName: '',
    vendorId: null,
    amount: 0,
    amountPaid: 0,
    isPaid: false,
    date: '2026-03-01',
    paidDate: null,
    paymentMethod: 'Check',
    ...over,
  }) as Expense

const V = (over: Partial<Vendor> & Pick<Vendor, 'id' | 'name'>) =>
  ({ projectId: 'p1', taxId: '', ...over }) as Vendor

describe('candidateThresholdForYear', () => {
  it('uses $600 through 2025 and $2,000 starting in 2026', () => {
    expect(candidateThresholdForYear(2025)).toBe(600)
    expect(candidateThresholdForYear(2026)).toBe(2_000)
  })
})

describe('isPaymentNetworkMethod', () => {
  it('recognizes common card and third-party network labels but not direct payments', () => {
    for (const method of ['Credit card', 'Debit Card', 'PayPal', 'Venmo', 'Cash App', 'Apple Pay']) {
      expect(isPaymentNetworkMethod(method), method).toBe(true)
    }
    for (const method of ['Check', 'ACH / bank transfer', 'Cash', 'Wire', 'Zelle']) {
      expect(isPaymentNetworkMethod(method), method).toBe(false)
    }
  })
})

describe('vendor1099Rollup', () => {
  it('totals eligible payments across projects and surfaces 2026 candidates at $2,000', () => {
    const rows = vendor1099Rollup(
      [
        E({ id: '1', projectId: 'p1', vendorName: 'Smith Plumbing', amount: 1_200, amountPaid: 1_200, isPaid: true, paidDate: '2026-02-01' }),
        E({ id: '2', projectId: 'p2', vendorName: 'smith plumbing', amount: 800, amountPaid: 800, isPaid: true, paidDate: '2026-05-01' }),
        E({ id: '3', vendorName: 'Tiny Co', amount: 100, amountPaid: 100, isPaid: true, paidDate: '2026-04-01' }),
        E({ id: '4', vendorName: 'Last Year Co', amount: 5_000, amountPaid: 5_000, isPaid: true, paidDate: '2025-12-31' }),
      ],
      2026,
    )

    expect(rows.map((row) => [row.vendor, row.eligiblePaid, row.paymentCount, row.candidate])).toEqual([
      ['Smith Plumbing', 2_000, 2, true],
      ['Tiny Co', 100, 1, false],
    ])
  })

  it('uses the historical $600 threshold before 2026', () => {
    const [row] = vendor1099Rollup(
      [E({ vendorName: 'Edge', amount: 600, amountPaid: 600, isPaid: true, paidDate: '2025-01-01' })],
      2025,
    )
    expect(row.candidate).toBe(true)
  })

  it('uses vendorId to follow a renamed profile and complete tax ids to merge project profiles', () => {
    const vendors = [
      V({ id: 'v1', projectId: 'p1', name: 'Acme Electric LLC', taxId: '12-3456789' }),
      V({ id: 'v2', projectId: 'p2', name: 'ACME Electrical', taxId: '12-3456789' }),
    ]
    const [row] = vendor1099Rollup(
      [
        E({ id: '1', projectId: 'p1', vendorId: 'v1', vendorName: 'Old Acme Name', amount: 1_200, amountPaid: 1_200, isPaid: true, paidDate: '2026-02-01' }),
        E({ id: '2', projectId: 'p2', vendorId: 'v2', vendorName: 'ACME Electrical', amount: 900, amountPaid: 900, isPaid: true, paidDate: '2026-03-01' }),
      ],
      2026,
      vendors,
    )

    expect(row.vendor).toBe('Acme Electric LLC')
    expect(row.vendorIds).toEqual(['v1', 'v2'])
    expect(row.eligiblePaid).toBe(2_100)
    expect(row.hasTaxId).toBe(true)
    expect(row.candidate).toBe(true)
  })

  it('merges a same-name project profile without a tax id when the identity is unambiguous', () => {
    const vendors = [
      V({ id: 'v1', projectId: 'p1', name: 'Smith Plumbing', taxId: '12-3456789' }),
      V({ id: 'v2', projectId: 'p2', name: 'Smith Plumbing', taxId: '' }),
    ]
    const [row] = vendor1099Rollup(
      [
        E({ id: '1', projectId: 'p1', vendorId: 'v1', vendorName: 'Smith Plumbing', amount: 1_200, amountPaid: 1_200, isPaid: true, paidDate: '2026-02-01' }),
        E({ id: '2', projectId: 'p2', vendorId: 'v2', vendorName: 'Smith Plumbing', amount: 800, amountPaid: 800, isPaid: true, paidDate: '2026-03-01' }),
      ],
      2026,
      vendors,
    )
    expect(row.eligiblePaid).toBe(2_000)
    expect(row.candidate).toBe(true)
  })

  it('separates payment-network dollars from the candidate threshold', () => {
    const [row] = vendor1099Rollup(
      [
        E({ id: '1', vendorName: 'Card Vendor', amount: 1_500, amountPaid: 1_500, isPaid: true, paidDate: '2026-02-01', paymentMethod: 'Credit card' }),
        E({ id: '2', vendorName: 'Card Vendor', amount: 700, amountPaid: 700, isPaid: true, paidDate: '2026-03-01', paymentMethod: 'Check' }),
      ],
      2026,
    )

    expect(row.eligiblePaid).toBe(700)
    expect(row.excludedNetworkPaid).toBe(1_500)
    expect(row.excludedNetworkCount).toBe(1)
    expect(row.candidate).toBe(false)
  })

  it('flags expense-date fallbacks for human review', () => {
    const [row] = vendor1099Rollup(
      [E({ vendorName: 'No Paid Date', amount: 2_000, amountPaid: 2_000, isPaid: true, paidDate: null })],
      2026,
    )
    expect(row.eligiblePaid).toBe(2_000)
    expect(row.missingPaidDateCount).toBe(1)
  })

  it('flags cumulative partial-payment dates for allocation review', () => {
    const [row] = vendor1099Rollup(
      [E({ vendorName: 'Partial', amount: 3_000, amountPaid: 2_000, isPaid: true, paidDate: '2026-06-01' })],
      2026,
    )
    expect(row.partialPaymentCount).toBe(1)
  })
})
