import type {
  AllowanceSelection,
  Bid,
  BudgetLineItem,
  ChangeOrder,
  Expense,
  ProjectTask,
  Vendor,
} from '../../domain/types'
import { balanceDue, effectiveAmountPaid } from '../../lib/expenseMath'
import { diff, sumBy } from '../../lib/money'
import { coiStatus, type CoiStatus } from '../vendors/coi'
import { vendorRollup, type VendorRollup } from '../vendors/vendorRollup'

export interface VendorOperationRow {
  vendor: Vendor
  rollup: VendorRollup
  insurance: CoiStatus
}

export interface VendorOperationSummary {
  vendorCount: number
  openVendorCount: number
  insuranceAttentionCount: number
  invoiced: number
  paid: number
  open: number
}

export function vendorOperationRows(
  vendors: Vendor[],
  expenses: Expense[],
  bids: Bid[],
  tasks: ProjectTask[],
): VendorOperationRow[] {
  return vendors.map((vendor) => ({
    vendor,
    rollup: vendorRollup(vendor, expenses, bids, tasks),
    insurance: coiStatus(vendor.insuranceExpiry),
  }))
}

export function vendorOperationSummary(
  rows: VendorOperationRow[],
): VendorOperationSummary {
  // A legacy name-only expense can appear on duplicate vendor profiles. De-duplicate the
  // project summary by expense ID while preserving the card/detail resolver exactly.
  const linkedExpenses = [
    ...new Map(
      rows.flatMap((row) => row.rollup.expenses).map((expense) => [expense.id, expense]),
    ).values(),
  ]
  return {
    vendorCount: rows.length,
    openVendorCount: rows.filter((row) => row.rollup.open > 0).length,
    insuranceAttentionCount: rows.filter(
      (row) => row.insurance === 'expired' || row.insurance === 'expiring',
    ).length,
    invoiced: sumBy(linkedExpenses, (expense) => expense.amount),
    paid: sumBy(linkedExpenses, effectiveAmountPaid),
    open: sumBy(linkedExpenses, balanceDue),
  }
}

export interface ChangeOrderStatusSummary {
  count: number
  amount: number
}

export interface ChangeOrderOperationSummary {
  total: ChangeOrderStatusSummary
  pending: ChangeOrderStatusSummary
  approved: ChangeOrderStatusSummary
  paid: ChangeOrderStatusSummary
  unassignedCount: number
}

export function changeOrderOperationSummary(orders: ChangeOrder[]): ChangeOrderOperationSummary {
  const status = (name: ChangeOrder['status']): ChangeOrderStatusSummary => {
    const matching = orders.filter((order) => order.status === name)
    return { count: matching.length, amount: sumBy(matching, (order) => order.amount) }
  }
  return {
    total: { count: orders.length, amount: sumBy(orders, (order) => order.amount) },
    pending: status('pending'),
    approved: status('approved'),
    paid: status('paid'),
    unassignedCount: orders.filter((order) => !order.budgetLineItemId && !order.budgetLineItemTitle.trim()).length,
  }
}

export type AllowanceUsageSource = 'selections' | 'expenses' | 'none' | 'reclassified' | 'unlinked'

export interface AllowanceOperationGroup {
  id: string
  lineItem: BudgetLineItem | null
  selections: AllowanceSelection[]
  allowance: number | null
  used: number
  remaining: number | null
  source: AllowanceUsageSource
}

export interface AllowanceOperationSummary {
  itemCount: number
  allowance: number
  used: number
  available: number
  overage: number
  unselectedCount: number
  reclassifiedSelectionCount: number
  unlinkedSelectionCount: number
}

export function allowanceOperationGroups(
  lineItems: BudgetLineItem[],
  selections: AllowanceSelection[],
  expenses: Expense[],
): AllowanceOperationGroup[] {
  const allowanceItems = lineItems.filter((item) => item.isAllowance)
  const allowanceIds = new Set(allowanceItems.map((item) => item.id))
  const lineItemById = new Map(lineItems.map((item) => [item.id, item]))
  const groups = allowanceItems.map<AllowanceOperationGroup>((lineItem) => {
    const linkedSelections = selections.filter((selection) => selection.lineItemId === lineItem.id)
    const linkedExpenses = expenses.filter((expense) => expense.budgetLineItemId === lineItem.id)
    const expenseAmount = sumBy(linkedExpenses, (expense) => expense.amount)
    const used = linkedSelections.length > 0
      ? sumBy(linkedSelections, (selection) => selection.amount)
      : expenseAmount
    const source: AllowanceUsageSource = linkedSelections.length > 0
      ? 'selections'
      : linkedExpenses.length > 0
        ? 'expenses'
        : 'none'
    return {
      id: lineItem.id,
      lineItem,
      selections: linkedSelections,
      allowance: lineItem.allowanceAmount,
      used,
      remaining: diff(lineItem.allowanceAmount, used),
      source,
    }
  })

  // Preserve access to selections whose allowance line was removed or reclassified.
  const nonAllowanceLineIds = [
    ...new Set(
      selections
        .filter((selection) => !allowanceIds.has(selection.lineItemId))
        .map((selection) => selection.lineItemId),
    ),
  ]
  for (const lineItemId of nonAllowanceLineIds) {
    const linkedSelections = selections.filter((selection) => selection.lineItemId === lineItemId)
    const reclassifiedLineItem = lineItemById.get(lineItemId) ?? null
    groups.push({
      id: `${reclassifiedLineItem ? 'reclassified' : 'unlinked'}-${lineItemId}`,
      lineItem: reclassifiedLineItem,
      selections: linkedSelections,
      allowance: null,
      used: sumBy(linkedSelections, (selection) => selection.amount),
      remaining: null,
      source: reclassifiedLineItem ? 'reclassified' : 'unlinked',
    })
  }

  return groups
}

export function allowanceOperationSummary(groups: AllowanceOperationGroup[]): AllowanceOperationSummary {
  const linked = groups.filter(
    (group): group is AllowanceOperationGroup & { lineItem: BudgetLineItem; allowance: number; remaining: number } =>
      group.lineItem !== null && group.allowance !== null && group.remaining !== null,
  )
  return {
    itemCount: linked.length,
    allowance: sumBy(linked, (group) => group.allowance),
    used: sumBy(linked, (group) => group.used),
    available: sumBy(linked, (group) => Math.max(0, group.remaining)),
    overage: sumBy(linked, (group) => Math.max(0, -group.remaining)),
    unselectedCount: linked.filter((group) => group.selections.length === 0).length,
    reclassifiedSelectionCount: groups
      .filter((group) => group.source === 'reclassified')
      .reduce((total, group) => total + group.selections.length, 0),
    unlinkedSelectionCount: groups
      .filter((group) => group.source === 'unlinked')
      .reduce((total, group) => total + group.selections.length, 0),
  }
}
