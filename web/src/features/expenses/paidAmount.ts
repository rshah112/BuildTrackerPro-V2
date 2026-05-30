/** Resolve what `amountPaid` should be for an expense.
 *
 *  A paid expense defaults to FULLY paid; an unpaid one to $0. A positive partial
 *  amount the user entered is preserved. This fixes the bug where a new paid expense
 *  (the "Paid" box is checked by default) left the "Amount paid" field at its 0
 *  default and silently recorded $0 paid — making cash-paid totals wrong. */
export function resolvePaidAmount(isPaid: boolean, amountPaid: number, amount: number): number {
  if (!isPaid) return 0
  return amountPaid > 0 ? amountPaid : amount
}
