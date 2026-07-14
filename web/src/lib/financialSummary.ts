import type {
  AggAllowanceSelection,
  AggChangeOrder,
  AggExpense,
  AggItem,
} from './budgetAggregates'
import {
  actualSpend,
  cashPaidTotal,
  committedSpend,
  pendingExposure,
} from './budgetAggregates'
import {
  lineItemHealth,
  openCommitment,
  spentAndCommitted,
  type BudgetHealth,
} from './budgetMath'
import {
  balanceDue,
  effectiveAmountPaid,
  payableBalance,
  retainageHeld,
  type ExpenseAmounts,
} from './expenseMath'
import { cents, diff, sum, sumBy } from './money'

/** Project fields that participate in presentation-only financial summaries. */
export interface FinancialProject {
  constructionBudget: number
  contingencyBudget: number
  purchasePrice?: number
  closingCosts?: number
}

/** Aggregate expense fields plus the optional retainage used by payable summaries. */
export interface FinancialExpense extends AggExpense, ExpenseAmounts {
  retainageAmount?: number
}

export interface ProjectFinancialSummaryInput {
  project: FinancialProject
  lineItems: AggItem[]
  expenses: FinancialExpense[]
  changeOrders: AggChangeOrder[]
  allowanceSelections: AggAllowanceSelection[]
}

/**
 * A single, presentation-ready project rollup.
 *
 * Important vocabulary:
 * - `actual` is incurred cost, not cash paid.
 * - `committed` is remaining/open commitment plus approved, uninvoiced change orders.
 * - `projected` adds pending change-order exposure to actual + committed.
 * - `estimatedFinalCost` preserves the existing dashboard EAC heuristic: unspent base
 *   scope is assumed still to be spent, while contingency remains a separate reserve.
 *
 * All money addition/subtraction routes through the cent-exact helpers in money.ts.
 */
export interface ProjectFinancialSummary {
  baseBudget: number
  contingencyBudget: number
  constructionLimit: number
  lineItemBudget: number
  unallocatedBudget: number
  landAcquisition: number
  allInBudget: number

  actual: number
  committed: number
  pending: number
  exposure: number
  projected: number
  remaining: number
  utilization: number
  usedPct: number

  estimateToComplete: number
  estimatedFinalCost: number
  estimatedVariance: number
  contingencyUsed: number
  contingencyRemaining: number
  contingencyUtilization: number
  contingencyUsedPct: number

  expenseInvoiced: number
  expensePaid: number
  cashPaid: number
  invoiceBalance: number
  payableNow: number
  retainage: number
}

export function projectFinancialSummary({
  project,
  lineItems,
  expenses,
  changeOrders,
  allowanceSelections,
}: ProjectFinancialSummaryInput): ProjectFinancialSummary {
  const baseBudget = project.constructionBudget ?? 0
  const contingencyBudget = project.contingencyBudget ?? 0
  const constructionLimit = sum([baseBudget, contingencyBudget])
  const lineItemBudget = sumBy(lineItems, (item) => item.budget)
  const unallocatedBudget = diff(baseBudget, lineItemBudget)
  const landAcquisition = sum([project.purchasePrice ?? 0, project.closingCosts ?? 0])
  const allInBudget = sum([landAcquisition, constructionLimit])

  const actual = actualSpend(lineItems, expenses, allowanceSelections, changeOrders)
  const committed = committedSpend(lineItems, changeOrders, expenses)
  const pending = pendingExposure(changeOrders, expenses)
  const exposure = sum([actual, committed])
  const projected = sum([exposure, pending])
  const remaining = diff(constructionLimit, projected)
  const utilization = constructionLimit > 0 ? projected / constructionLimit : 0

  // Existing dashboard EAC: preserve the base-scope assumption while keeping
  // contingency outside estimate-to-complete and pending COs inside final exposure.
  const estimateToComplete = Math.max(0, diff(baseBudget, exposure))
  const estimatedFinalCost = sum([exposure, estimateToComplete, pending])
  const estimatedVariance = diff(estimatedFinalCost, baseBudget)

  const overBase = Math.max(0, diff(exposure, baseBudget))
  const contingencyUsed = Math.min(contingencyBudget, overBase)
  const contingencyRemaining = Math.max(0, diff(contingencyBudget, overBase))
  const contingencyUtilization = contingencyBudget > 0 ? contingencyUsed / contingencyBudget : 0

  const expenseInvoiced = sumBy(expenses, (expense) => expense.amount)
  const expensePaid = sumBy(expenses, effectiveAmountPaid)
  const cashPaid = cashPaidTotal(expenses, changeOrders)
  const invoiceBalance = sumBy(expenses, balanceDue)
  const payableNow = sumBy(expenses, payableBalance)
  const retainage = sumBy(expenses, retainageHeld)

  return {
    baseBudget,
    contingencyBudget,
    constructionLimit,
    lineItemBudget,
    unallocatedBudget,
    landAcquisition,
    allInBudget,
    actual,
    committed,
    pending,
    exposure,
    projected,
    remaining,
    utilization,
    usedPct: Math.round(utilization * 100),
    estimateToComplete,
    estimatedFinalCost,
    estimatedVariance,
    contingencyUsed,
    contingencyRemaining,
    contingencyUtilization,
    contingencyUsedPct: Math.round(contingencyUtilization * 100),
    expenseInvoiced,
    expensePaid,
    cashPaid,
    invoiceBalance,
    payableNow,
    retainage,
  }
}

export interface CategoryFinancialSummary {
  categoryName: string
  itemCount: number
  allowanceItemCount: number

  /** Sum of persisted line-item budget values, matching the existing Budget screen. */
  budget: number
  /** Comparison limit: regular-item budget or allowanceAmount for allowance items. */
  effectiveBudget: number
  actual: number
  openCommitment: number
  exposure: number
  /** Effective budget minus exposure. Negative means the category is over budget. */
  remaining: number
  /** Exposure minus effective budget. Positive means the category is over budget. */
  variance: number
  /** Raw ratio, intentionally allowed above 1 just like line-item utilization. */
  utilization: number
  status: BudgetHealth
  overBudgetItemCount: number
  nearLimitItemCount: number
}

/**
 * Roll up one category from a project-scoped line-item collection.
 *
 * Stored line-item actuals are authoritative and already reconciled by PostgreSQL.
 * Allowance items compare that actual against allowanceAmount and carry no open
 * commitment, exactly matching budgetMath's line-item invariants.
 */
export function categoryFinancialSummary(
  categoryName: string,
  lineItems: AggItem[],
): CategoryFinancialSummary {
  const items = lineItems.filter((item) => item.categoryName === categoryName)
  const budget = sumBy(items, (item) => item.budget)
  const effectiveBudget = sumBy(items, (item) =>
    item.isAllowance ? item.allowanceAmount : item.budget,
  )
  const actual = sumBy(items, (item) => item.actual)
  const open = sumBy(items, openCommitment)
  const exposure = sumBy(items, spentAndCommitted)
  const remaining = diff(effectiveBudget, exposure)
  const variance = diff(exposure, effectiveBudget)
  const utilization = effectiveBudget > 0 ? exposure / effectiveBudget : 0
  const status: BudgetHealth =
    cents(variance) > 0 ? 'overBudget' : utilization >= 0.9 ? 'nearLimit' : 'healthy'
  const health = items.map(lineItemHealth)

  return {
    categoryName,
    itemCount: items.length,
    allowanceItemCount: items.filter((item) => item.isAllowance).length,
    budget,
    effectiveBudget,
    actual,
    openCommitment: open,
    exposure,
    remaining,
    variance,
    utilization,
    status,
    overBudgetItemCount: health.filter((value) => value === 'overBudget').length,
    nearLimitItemCount: health.filter((value) => value === 'nearLimit').length,
  }
}
