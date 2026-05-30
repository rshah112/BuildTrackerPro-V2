import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { Vendor } from '../../domain/types'

const TABLE = 'vendors'

export const useVendors = (projectId: string) => useRows<Vendor>(TABLE, { projectId })
export const useCreateVendor = () => useCreateRow<Vendor>(TABLE)
export const useUpdateVendor = () => useUpdateRow<Vendor>(TABLE)
export const useRemoveVendor = () => useRemoveRow(TABLE)
