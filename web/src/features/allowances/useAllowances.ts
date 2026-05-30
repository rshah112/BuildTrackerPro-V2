import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { AllowanceSelection } from '../../domain/types'

const TABLE = 'allowance_selections'

export const useAllowances = (projectId: string) => useRows<AllowanceSelection>(TABLE, { projectId })
export const useCreateAllowance = () => useCreateRow<AllowanceSelection>(TABLE)
export const useUpdateAllowance = () => useUpdateRow<AllowanceSelection>(TABLE)
export const useRemoveAllowance = () => useRemoveRow(TABLE)
