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
const pad2 = (n: number) => String(n).padStart(2, '0')

/** Today as yyyy-mm-dd in the DEVICE-LOCAL calendar (not UTC), so the 14-day horizon
 *  lines up with the user's actual day rather than shifting near midnight in non-UTC
 *  timezones. Pass this to the forecast functions. */
export function localToday(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = day(iso).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export interface CashFlowOptions {
  /** When false, items whose expected date is already past (overdue) are EXCLUDED rather than
   *  clamped forward into the window — use this when overdue is surfaced separately so the same
   *  dollars aren't counted in both an "Overdue" and a "Due next 14 days" view. Default true. */
  includeOverdue?: boolean
}

/** Upcoming payments within the next FORECAST_DAYS, sorted by date then amount desc. */
export function cashFlowPayments(
  expenses: Expense[],
  changeOrders: ChangeOrder[],
  todayISO: string,
  opts: CashFlowOptions = {},
): CashFlowPayment[] {
  const includeOverdue = opts.includeOverdue ?? true
  const start = day(todayISO)
  const end = addDays(start, FORECAST_DAYS)

  const expensePayments: CashFlowPayment[] = expenses.flatMap((e) => {
    const due = balanceDue(e)
    if (due <= 0) return []
    const expected = e.expectedPaymentDate ?? e.dueDate
    if (!expected) return []
    const expDay = day(expected)
    if (!includeOverdue && expDay < start) return []
    const forecastDay = max(expDay, start)
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
    const expDay = day(o.expectedPaymentDate)
    if (!includeOverdue && expDay < start) return []
    const forecastDay = max(expDay, start)
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
  opts: CashFlowOptions = {},
): CashFlowDay[] {
  const payments = cashFlowPayments(expenses, changeOrders, todayISO, opts)
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
  opts: CashFlowOptions = {},
): number {
  return sumBy(cashFlowPayments(expenses, changeOrders, todayISO, opts), (p) => p.amount)
}
