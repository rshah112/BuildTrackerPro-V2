import type { ChangeOrder, Expense } from '../../domain/types'
import { balanceDue } from '../../lib/expenseMath'
import { cents, dollars, sumBy } from '../../lib/money'

// Port of ParamusBuild/Data/CashFlowService.swift — 14-day cash outflow forecast.

export const FORECAST_DAYS = 14

export type CashFlowExposure = 'committed' | 'pending'

export interface CashFlowPayment {
  id: string
  kind: 'expense' | 'changeOrder'
  exposure: CashFlowExposure
  title: string
  subtitle: string
  amount: number
  expectedDate: string // yyyy-mm-dd
}

export interface CashFlowDay {
  date: string // yyyy-mm-dd
  payments: CashFlowPayment[]
  committedTotal: number
  pendingTotal: number
  total: number
}

const day = (iso: string) => iso.slice(0, 10)
const max = (a: string, b: string) => (a < b ? b : a)

export function addDays(iso: string, days: number): string {
  const [y, m, d] = day(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Upcoming payments within the next FORECAST_DAYS, sorted by date then amount desc. */
export function cashFlowPayments(
  expenses: Expense[],
  changeOrders: ChangeOrder[],
  todayISO: string,
): CashFlowPayment[] {
  const start = day(todayISO)
  const end = addDays(start, FORECAST_DAYS)

  const expensePayments: CashFlowPayment[] = expenses.flatMap((e) => {
    const due = balanceDue(e)
    if (due <= 0) return []
    const expected = e.expectedPaymentDate ?? e.dueDate
    if (!expected) return []
    const forecastDay = max(day(expected), start)
    if (!(forecastDay < end)) return []
    return [
      {
        id: `expense-${e.id}`,
        kind: 'expense',
        exposure: 'committed',
        title: e.vendorName || 'Expense',
        subtitle: e.invoiceNumber.trim() ? `Inv ${e.invoiceNumber}` : e.categoryName || 'Uncategorized',
        amount: due,
        expectedDate: forecastDay,
      },
    ]
  })

  const orderPayments: CashFlowPayment[] = changeOrders.flatMap((o) => {
    if (o.status === 'paid' || !o.expectedPaymentDate) return []
    const forecastDay = max(day(o.expectedPaymentDate), start)
    if (!(forecastDay < end)) return []
    return [
      {
        id: `change-${o.id}`,
        kind: 'changeOrder',
        exposure: o.status === 'pending' ? 'pending' : 'committed',
        title: o.title || 'Change order',
        subtitle: o.status === 'pending' ? 'Pending change' : 'Approved change',
        amount: o.amount,
        expectedDate: forecastDay,
      },
    ]
  })

  return [...expensePayments, ...orderPayments].sort((a, b) =>
    a.expectedDate === b.expectedDate ? b.amount - a.amount : a.expectedDate < b.expectedDate ? -1 : 1,
  )
}

export function cashFlowForecast(
  expenses: Expense[],
  changeOrders: ChangeOrder[],
  todayISO: string,
): CashFlowDay[] {
  const payments = cashFlowPayments(expenses, changeOrders, todayISO)
  const start = day(todayISO)
  return Array.from({ length: FORECAST_DAYS }, (_, offset) => {
    const date = addDays(start, offset)
    const dayPayments = payments.filter((p) => p.expectedDate === date)
    const committedTotal = sumBy(
      dayPayments.filter((p) => p.exposure === 'committed'),
      (p) => p.amount,
    )
    const pendingTotal = sumBy(
      dayPayments.filter((p) => p.exposure === 'pending'),
      (p) => p.amount,
    )
    return {
      date,
      payments: dayPayments,
      committedTotal,
      pendingTotal,
      total: dollars(cents(committedTotal) + cents(pendingTotal)),
    }
  })
}

export function nextFourteenDaysDue(
  expenses: Expense[],
  changeOrders: ChangeOrder[],
  todayISO: string,
): number {
  return sumBy(cashFlowPayments(expenses, changeOrders, todayISO), (p) => p.amount)
}
