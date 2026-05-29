import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { BudgetCategory, BudgetLineItem } from '../../domain/types'

export const useCategories = (projectId: string) =>
  useRows<BudgetCategory>('budget_categories', { projectId })

export const useCreateCategory = () => useCreateRow<BudgetCategory>('budget_categories')
export const useUpdateCategory = () => useUpdateRow<BudgetCategory>('budget_categories')
export const useRemoveCategory = () => useRemoveRow('budget_categories')

export const useLineItems = (projectId: string) =>
  useRows<BudgetLineItem>('budget_line_items', { projectId })

export const useCreateLineItem = () => useCreateRow<BudgetLineItem>('budget_line_items')
export const useUpdateLineItem = () => useUpdateRow<BudgetLineItem>('budget_line_items')
export const useRemoveLineItem = () => useRemoveRow('budget_line_items')
