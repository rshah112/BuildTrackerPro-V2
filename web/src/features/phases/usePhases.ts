import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { Phase } from '../../domain/types'

const TABLE = 'phases'

export const usePhases = (projectId: string) => useRows<Phase>(TABLE, { projectId })
export const useCreatePhase = () => useCreateRow<Phase>(TABLE)
export const useUpdatePhase = () => useUpdateRow<Phase>(TABLE)
export const useRemovePhase = () => useRemoveRow(TABLE)
