import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense } from '../../domain/types'
import { useRows } from '../../data/hooks'
import { table } from '../../data/table'
import { actualPatchesForExpenses } from '../expenses/recalculateLineItemActuals'
import { useExpenses } from '../expenses/useExpenses'
import { useLineItems } from './useBudget'

interface Overrides {
  expenses?: Expense[]
  changeOrders?: ChangeOrder[]
  allowanceSelections?: AllowanceSelection[]
}

const lineItemsApi = table<BudgetLineItem>('budget_line_items')

/** Recompute and persist line-item `actual` from the project's expenses, paid change
 *  orders, and allowance selections. Pass an override array for whichever set you just
 *  mutated (the cache may not have refetched yet); the rest default to current data.
 *  Shared by Expenses, Change Orders, and Allowance Selections. */
export function useSyncActuals(projectId: string) {
  const qc = useQueryClient()
  const { data: lineItems = [] } = useLineItems(projectId)
  const { data: expenses = [] } = useExpenses(projectId)
  const { data: changeOrders = [] } = useRows<ChangeOrder>('change_orders', { projectId })
  const { data: allowanceSelections = [] } = useRows<AllowanceSelection>('allowance_selections', { projectId })

  return useCallback(
    async (overrides?: Overrides) => {
      const patches = actualPatchesForExpenses({
        lineItems,
        expenses: overrides?.expenses ?? expenses,
        changeOrders: overrides?.changeOrders ?? changeOrders,
        allowanceSelections: overrides?.allowanceSelections ?? allowanceSelections,
      })
      if (patches.length === 0) return
      // Persist only the changed rows' `actual`. We write directly (not via the per-row
      // mutation hook) and invalidate ONCE at the end, so a save that touches many line
      // items doesn't fire one cache-invalidation + refetch per row. (A single-request
      // bulk update would need a Postgres RPC — see the prepared migration notes.)
      await Promise.all(patches.map((p) => lineItemsApi.update(p.id, { actual: p.actual } as Partial<BudgetLineItem>)))
      await qc.invalidateQueries({ queryKey: ['budget_line_items'] })
    },
    [lineItems, expenses, changeOrders, allowanceSelections, qc],
  )
}
