// Multi-entity aggregates ported from ParamusBuild/Data/BudgetMathService.swift.
// Inputs are assumed pre-scoped to a single project (the data hooks list by
// project). All arithmetic is cent-exact via lib/money.

import { cents, dollars, sumBy } from './money'
import { effectiveAmountPaid } from './expenseMath'
import { openCommitment } from './budgetMath'

export interface AggItem {
  id: string
  title: string
  categoryName: string
  budget: number
  actual: number
  committed: number
  isAllowance: boolean
  allowanceAmount: number
}
export interface AggExpense {
  amount: number
  amountPaid: number
  isPaid: boolean
  budgetLineItemId: string | null
  budgetLineItemTitle: string
  categoryName: string
}
export interface AggChangeOrder {
  amount: number
  status: 'pending' | 'approved' | 'paid'
  budgetLineItemId: string | null
  budgetLineItemTitle: string
  categoryName: string
}
export interface AggAllowanceSelection {
  lineItemId: string
  amount: number
}

const norm = (s: string) => s.trim().toLowerCase()

// Resolve an expense/change-order to a line item: by id, else by title+category.
function resolveItemId(
  ref: { budgetLineItemId: string | null; budgetLineItemTitle: string; categoryName: string },
  items: AggItem[],
): string | null {
  if (ref.budgetLineItemId && items.some((i) => i.id === ref.budgetLineItemId)) return ref.budgetLineItemId
  if (ref.budgetLineItemTitle.trim() !== '') {
    const m = items.find(
      (i) => norm(i.title) === norm(ref.budgetLineItemTitle) && norm(i.categoryName) === norm(ref.categoryName),
    )
    if (m) return m.id
  }
  return null
}

/** Recompute each line item's `actual` from expenses, paid COs, and allowance selections. */
export function recalculateActuals(
  items: AggItem[],
  expenses: AggExpense[],
  changeOrders: AggChangeOrder[],
  allowanceSelections: AggAllowanceSelection[],
): Map<string, number> {
  const actualCents = new Map<string, number>(items.map((i) => [i.id, 0]))
  const selectionCents = new Map<string, number>()

  for (const sel of allowanceSelections) {
    selectionCents.set(sel.lineItemId, (selectionCents.get(sel.lineItemId) ?? 0) + cents(sel.amount))
  }
  for (const e of expenses) {
    const id = resolveItemId(e, items)
    if (id == null) continue
    actualCents.set(id, (actualCents.get(id) ?? 0) + cents(e.amount))
  }
  for (const co of changeOrders) {
    if (co.status !== 'paid') continue
    const id = resolveItemId(co, items)
    if (id == null) continue
    actualCents.set(id, (actualCents.get(id) ?? 0) + cents(co.amount))
  }

  const out = new Map<string, number>()
  for (const item of items) {
    const hasSel = selectionCents.has(item.id)
    const c = item.isAllowance && hasSel ? selectionCents.get(item.id)! : (actualCents.get(item.id) ?? 0)
    out.set(item.id, dollars(c))
  }
  return out
}

/** Total invoiced/incurred, de-duplicating allowance expenses against selections. */
export function actualSpend(
  items: AggItem[],
  expenses: AggExpense[],
  allowanceSelections: AggAllowanceSelection[],
  changeOrders: AggChangeOrder[],
): number {
  const allowanceIds = new Set(items.filter((i) => i.isAllowance).map((i) => i.id))
  const idsWithSelections = new Set(allowanceSelections.map((s) => s.lineItemId))
  const counted = expenses.filter(
    (e) => !(e.budgetLineItemId && allowanceIds.has(e.budgetLineItemId) && idsWithSelections.has(e.budgetLineItemId)),
  )
  const expenseCents = cents(sumBy(counted, (e) => e.amount))
  const allowanceCents = cents(sumBy(allowanceSelections.filter((s) => allowanceIds.has(s.lineItemId)), (s) => s.amount))
  const paidOrderCents = cents(sumBy(changeOrders.filter((c) => c.status === 'paid'), (c) => c.amount))
  return dollars(expenseCents + allowanceCents + paidOrderCents)
}

/** Open commitments + approved-but-unpaid change orders. */
export function committedSpend(items: AggItem[], changeOrders: AggChangeOrder[]): number {
  const open = cents(sumBy(items, (i) => openCommitment(i)))
  const approved = cents(sumBy(changeOrders.filter((c) => c.status === 'approved'), (c) => c.amount))
  return dollars(open + approved)
}

/** Cash actually paid out. */
export function cashPaidTotal(expenses: AggExpense[], changeOrders: AggChangeOrder[]): number {
  const paidByExpense = cents(sumBy(expenses, (e) => effectiveAmountPaid(e)))
  const paidByOrder = cents(sumBy(changeOrders.filter((c) => c.status === 'paid'), (c) => c.amount))
  return dollars(paidByExpense + paidByOrder)
}

export function pendingExposure(changeOrders: AggChangeOrder[]): number {
  return sumBy(changeOrders.filter((c) => c.status === 'pending'), (c) => c.amount)
}

/** Excess of allowance actuals (selections, else tied expenses) over the allowance amount. */
export function allowanceOverage(
  items: AggItem[],
  allowanceSelections: AggAllowanceSelection[],
  expenses: AggExpense[] = [],
): number {
  let totalCents = 0
  for (const item of items.filter((i) => i.isAllowance)) {
    const sels = allowanceSelections.filter((s) => s.lineItemId === item.id)
    const actual = sels.length
      ? sumBy(sels, (s) => s.amount)
      : sumBy(expenses.filter((e) => e.budgetLineItemId === item.id), (e) => e.amount)
    totalCents += Math.max(0, cents(actual) - cents(item.allowanceAmount))
  }
  return dollars(totalCents)
}
