import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { LienWaiver } from '../../domain/types'

const TABLE = 'lien_waivers'

export const useLienWaivers = (projectId: string) => useRows<LienWaiver>(TABLE, { projectId })
export const useCreateLienWaiver = () => useCreateRow<LienWaiver>(TABLE)
export const useUpdateLienWaiver = () => useUpdateRow<LienWaiver>(TABLE)
export const useRemoveLienWaiver = () => useRemoveRow(TABLE)
