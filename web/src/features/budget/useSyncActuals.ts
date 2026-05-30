import { useCallback } from 'react'
import type { AllowanceSelection, ChangeOrder, Expense } from '../../domain/types'
import { useRows } from '../../data/hooks'
import { actualPatchesForExpenses } from '../expenses/recalculateLineItemActuals'
import { useExpenses } from '../expenses/useExpenses'
import { useLineItems, useUpdateLineItem } from './useBudget'

interface Overrides {
  expenses?: Expense[]
  changeOrders?: ChangeOrder[]
  allowanceSelections?: AllowanceSelection[]
}

/** Recompute and persist line-item `actual` from the project's expenses, paid change
 *  orders, and allowance selections. Pass an override array for whichever set you just
 *  mutated (the cache may not have refetched yet); the rest default to current data.
 *  Shared by Expenses, Change Orders, and Allowance Selections. */
export function useSyncActuals(projectId: string) {
  const { data: lineItems = [] } = useLineItems(projectId)
  const { data: expenses = [] } = useExpenses(projectId)
  const { data: changeOrders = [] } = useRows<ChangeOrder>('change_orders', { projectId })
  const { data: allowanceSelections = [] } = useRows<AllowanceSelection>('allowance_selections', { projectId })
  const updateLineItem = useUpdateLineItem()

  return useCallback(
    async (overrides?: Overrides) => {
      const patches = actualPatchesForExpenses({
        lineItems,
        expenses: overrides?.expenses ?? expenses,
        changeOrders: overrides?.changeOrders ?? changeOrders,
        allowanceSelections: overrides?.allowanceSelections ?? allowanceSelections,
      })
      await Promise.all(
        patches.map((p) => updateLineItem.mutateAsync({ id: p.id, patch: { actual: p.actual } })),
      )
    },
    [lineItems, expenses, changeOrders, allowanceSelections, updateLineItem],
  )
}
