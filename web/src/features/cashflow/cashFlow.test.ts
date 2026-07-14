import { describe, expect, it } from 'vitest'
import type { ChangeOrder, Expense } from '../../domain/types'
import { addDays, cashFlowForecast, cashFlowPayments, nextFourteenDaysDue } from './cashFlow'

const TODAY = '2026-06-01T00:00:00.000Z'

const expense = (over: Partial<Expense>): Expense =>
  ({
    id: 'e1',
    amount: 0,
    amountPaid: 0,
    isPaid: false,
    vendorName: 'Acme',
    invoiceNumber: '',
    categoryName: 'Framing',
    dueDate: null,
    expectedPaymentDate: null,
    ...over,
  }) as Expense

const order = (over: Partial<ChangeOrder>): ChangeOrder =>
  ({ id: 'c1', title: 'CO', amount: 0, status: 'pending', expectedPaymentDate: null, ...over }) as ChangeOrder

describe('addDays (yyyy-mm-dd, month rollover)', () => {
  it('adds across month boundaries', () => {
    expect(addDays('2026-06-01', 14)).toBe('2026-06-15')
    expect(addDays('2026-06-28', 5)).toBe('2026-07-03')
  })
})

describe('cashFlowPayments', () => {
  it('includes unpaid expense balance as committed; excludes paid and out-of-horizon', () => {
    const exps = [
      expense({ id: 'e1', amount: 1000, dueDate: '2026-06-05' }),
      expense({ id: 'e2', amount: 500, amountPaid: 500, isPaid: true, dueDate: '2026-06-06' }), // paid → 0
      expense({ id: 'e3', amount: 700, dueDate: '2026-07-01' }), // beyond 14d
    ]
    const ps = cashFlowPayments(exps, [], TODAY)
    expect(ps.map((p) => p.id)).toEqual(['expense-e1'])
    expect(ps[0].exposure).toBe('committed')
    expect(ps[0].amount).toBe(1000)
  })

  it('classifies change orders by status and sorts by date then amount', () => {
    const cos = [
      order({ id: 'cA', title: 'A', amount: 2000, status: 'pending', expectedPaymentDate: '2026-06-10' }),
      order({ id: 'cB', title: 'B', amount: 800, status: 'approved', expectedPaymentDate: '2026-06-03' }),
      order({ id: 'cC', title: 'C', amount: 9000, status: 'paid', expectedPaymentDate: '2026-06-04' }), // paid → excl
    ]
    const ps = cashFlowPayments([], cos, TODAY)
    expect(ps.map((p) => p.id)).toEqual(['change-cB', 'change-cA'])
    expect(ps[0].exposure).toBe('committed')
    expect(ps[1].exposure).toBe('pending')
  })

  it('does not forecast a change order again once a linked expense represents it', () => {
    const exps = [expense({ amount: 500, changeOrderId: 'co1', dueDate: '2026-06-04' })]
    const orders = [order({ id: 'co1', amount: 500, status: 'approved', expectedPaymentDate: '2026-06-04' })]
    expect(cashFlowPayments(exps, orders, TODAY).map((payment) => payment.id)).toEqual(['expense-e1'])
  })
})

describe('cashFlowForecast + nextFourteenDaysDue', () => {
  it('buckets payments into 14 days with cent-exact totals', () => {
    const exps = [expense({ id: 'e1', amount: 1000, dueDate: '2026-06-05' })]
    const cos = [
      order({ id: 'cA', amount: 2000, status: 'pending', expectedPaymentDate: '2026-06-10' }),
      order({ id: 'cB', amount: 800, status: 'approved', expectedPaymentDate: '2026-06-03' }),
    ]
    const days = cashFlowForecast(exps, cos, TODAY)
    expect(days).toHaveLength(14)
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]))
    expect(byDate['2026-06-03'].committedTotal).toBe(800)
    expect(byDate['2026-06-05'].committedTotal).toBe(1000)
    expect(byDate['2026-06-10'].pendingTotal).toBe(2000)
    expect(byDate['2026-06-10'].total).toBe(2000)
    expect(nextFourteenDaysDue(exps, cos, TODAY)).toBe(3800)
  })
})

describe('retainage', () => {
  it('excludes withheld retainage from the upcoming due amount', () => {
    const exps = [expense({ id: 'e1', amount: 1000, retainageAmount: 100, dueDate: '2026-06-05' })]
    const ps = cashFlowPayments(exps, [], TODAY)
    expect(ps[0].amount).toBe(900) // 1000 balance − 100 retainage held
  })

  it('does not forecast a retainage-only balance as currently payable', () => {
    const exps = [
      expense({
        id: 'e1',
        amount: 1000,
        amountPaid: 900,
        isPaid: true,
        retainageAmount: 100,
        dueDate: '2026-06-05',
      }),
    ]
    expect(cashFlowPayments(exps, [], TODAY)).toEqual([])
  })
})

describe('includeOverdue option', () => {
  it('excludes overdue items instead of clamping them forward when includeOverdue is false', () => {
    const exps = [
      expense({ id: 'past', amount: 500, dueDate: '2026-05-20' }), // overdue (before TODAY)
      expense({ id: 'soon', amount: 300, dueDate: '2026-06-05' }), // within window
    ]
    // default: overdue is clamped into the window → both counted (the cross-tile double-count)
    expect(nextFourteenDaysDue(exps, [], TODAY)).toBe(800)
    expect(cashFlowPayments(exps, [], TODAY).map((p) => p.id).sort()).toEqual(['expense-past', 'expense-soon'])
    // includeOverdue:false → only the genuinely in-window item
    expect(nextFourteenDaysDue(exps, [], TODAY, { includeOverdue: false })).toBe(300)
    expect(cashFlowPayments(exps, [], TODAY, { includeOverdue: false }).map((p) => p.id)).toEqual(['expense-soon'])
  })
})
