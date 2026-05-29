import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { Expense } from '../../domain/types'

const TABLE = 'expenses'

export const useExpenses = (projectId: string) => useRows<Expense>(TABLE, { projectId })
export const useCreateExpense = () => useCreateRow<Expense>(TABLE)
export const useUpdateExpense = () => useUpdateRow<Expense>(TABLE)
export const useRemoveExpense = () => useRemoveRow(TABLE)
