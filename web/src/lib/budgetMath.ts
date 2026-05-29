// Mirror of the computed money properties on ParamusBuild/Models/BudgetLineItem.swift.
// Every comparison happens in integer cents so an invisible float drift can't flip a
// budget-health bucket. Multi-entity aggregates (recalculateActuals, actualSpend with
// allowance de-duplication, committedSpend, cashPaidTotal, allowanceOverage) live with
// the data layer in Wave 1, since they operate over full entity collections.

import { cents, dollars, diff } from './money'

export type BudgetHealth = 'healthy' | 'nearLimit' | 'overBudget'

/** The subset of a budget line item needed for money derivations. */
export interface LineItemMoney {
  budget: number
  actual: number
  committed: number
  isAllowance: boolean
  allowanceAmount: number
}

/** Open commitment = committed minus actual, clamped at 0. Allowances carry none. */
export function openCommitment(li: LineItemMoney): number {
  if (li.isAllowance) return 0
  const d = cents(li.committed) - cents(li.actual)
  return dollars(Math.max(0, d))
}

/** Actual plus open commitment. */
export function spentAndCommitted(li: LineItemMoney): number {
  return dollars(cents(li.actual) + cents(openCommitment(li)))
}

/** Budget headroom. Allowances measure against allowanceAmount, not budget. */
export function remaining(li: LineItemMoney): number {
  if (li.isAllowance) return diff(li.allowanceAmount, li.actual)
  return diff(li.budget, spentAndCommitted(li))
}

/** Over/under. Allowance overage is clamped at 0 (never reports "under"). */
export function variance(li: LineItemMoney): number {
  if (li.isAllowance) {
    const d = cents(li.actual) - cents(li.allowanceAmount)
    return dollars(Math.max(0, d))
  }
  return diff(spentAndCommitted(li), li.budget)
}

/** Fraction of the limit consumed (raw ratio, matching native — not cent-rounded). */
export function utilization(li: LineItemMoney): number {
  const limit = li.isAllowance ? li.allowanceAmount : li.budget
  if (limit <= 0) return 0
  return spentAndCommitted(li) / limit
}

/** overBudget when variance > 0 (in cents); nearLimit at >= 90% utilization. */
export function lineItemHealth(li: LineItemMoney): BudgetHealth {
  if (cents(variance(li)) > 0) return 'overBudget'
  if (utilization(li) >= 0.9) return 'nearLimit'
  return 'healthy'
}
