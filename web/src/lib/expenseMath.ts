// Mirror of the computed money props on ParamusBuild/Models/Expense.swift.
import { cents, dollars } from './money'

export interface ExpenseAmounts {
  amount: number
  amountPaid: number
  isPaid: boolean
  retainageAmount?: number
}

export type ExpensePaymentState = 'open' | 'partial' | 'retainage' | 'paid'

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

/** Retainage still held, bounded to the expense's remaining balance. */
export function retainageHeld(e: ExpenseAmounts): number {
  const held = Math.max(0, cents(e.retainageAmount ?? 0))
  return dollars(Math.min(cents(balanceDue(e)), held))
}

/** Balance payable now, excluding retainage that is intentionally being held. */
export function payableBalance(e: ExpenseAmounts): number {
  return dollars(Math.max(0, cents(balanceDue(e)) - cents(retainageHeld(e))))
}

/** Shared display/reporting state. `isPaid` means a payment has been recorded; it does
 * not by itself mean that the invoice balance is zero. */
export function expensePaymentState(e: ExpenseAmounts): ExpensePaymentState {
  if (balanceDue(e) <= 0) return 'paid'
  if (payableBalance(e) <= 0 && retainageHeld(e) > 0) return 'retainage'
  if (effectiveAmountPaid(e) > 0) return 'partial'
  return 'open'
}
