// Mirror of the computed money props on ParamusBuild/Models/Expense.swift.
import { cents, dollars } from './money'

export interface ExpenseAmounts {
  amount: number
  amountPaid: number
  isPaid: boolean
}

/** Cash actually paid: 0 while unpaid; otherwise amountPaid clamped to [0, amount]. */
export function effectiveAmountPaid(e: ExpenseAmounts): number {
  if (!e.isPaid) return 0
  const bounded = Math.min(cents(e.amount), Math.max(0, cents(e.amountPaid)))
  return dollars(bounded)
}

/** Outstanding balance, never negative. */
export function balanceDue(e: ExpenseAmounts): number {
  return dollars(Math.max(0, cents(e.amount) - cents(effectiveAmountPaid(e))))
}
