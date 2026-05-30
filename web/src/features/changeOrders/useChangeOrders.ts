import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { ChangeOrder } from '../../domain/types'

const TABLE = 'change_orders'

export const useChangeOrders = (projectId: string) => useRows<ChangeOrder>(TABLE, { projectId })
export const useCreateChangeOrder = () => useCreateRow<ChangeOrder>(TABLE)
export const useUpdateChangeOrder = () => useUpdateRow<ChangeOrder>(TABLE)
export const useRemoveChangeOrder = () => useRemoveRow(TABLE)
