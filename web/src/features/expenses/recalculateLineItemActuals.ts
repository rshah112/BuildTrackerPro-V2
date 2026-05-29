import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense } from '../../domain/types'
import { recalculateActuals } from '../../lib/budgetAggregates'
import { roundedToCents } from '../../lib/money'

export interface ActualPatch {
  id: string
  actual: number
}

export function actualPatchesForExpenses({
  lineItems,
  expenses,
  changeOrders,
  allowanceSelections,
}: {
  lineItems: BudgetLineItem[]
  expenses: Expense[]
  changeOrders: ChangeOrder[]
  allowanceSelections: AllowanceSelection[]
}): ActualPatch[] {
  const actuals = recalculateActuals(lineItems, expenses, changeOrders, allowanceSelections)
  return lineItems
    .map((item) => ({ id: item.id, actual: actuals.get(item.id) ?? 0 }))
    .filter((patch) => {
      const current = lineItems.find((item) => item.id === patch.id)?.actual ?? 0
      return roundedToCents(current) !== roundedToCents(patch.actual)
    })
}

export function upsertExpense(expenses: Expense[], expense: Expense): Expense[] {
  const exists = expenses.some((e) => e.id === expense.id)
  return exists ? expenses.map((e) => (e.id === expense.id ? expense : e)) : [...expenses, expense]
}
