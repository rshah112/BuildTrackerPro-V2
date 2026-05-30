import { useRows, useCreateRow, useUpdateRow, useRemoveRow } from '../../data/hooks'
import type { ProjectTask } from '../../domain/types'

const TABLE = 'project_tasks'

export const useTasks = (projectId: string) => useRows<ProjectTask>(TABLE, { projectId })
export const useCreateTask = () => useCreateRow<ProjectTask>(TABLE)
export const useUpdateTask = () => useUpdateRow<ProjectTask>(TABLE)
export const useRemoveTask = () => useRemoveRow(TABLE)
