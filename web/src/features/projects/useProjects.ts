import { useRows, useCreateRow, useUpdateRow } from '../../data/hooks'
import type { Project } from '../../domain/types'

const TABLE = 'projects'

// Active (non-trashed) projects, RLS-scoped. Trashed projects come from useTrashedProjects.
export const useProjects = () => useRows<Project>(TABLE)
export const useTrashedProjects = () => useRows<Project>(TABLE, undefined, { trashed: 'only' })
export const useCreateProject = () => useCreateRow<Project>(TABLE)
export const useUpdateProject = () => useUpdateRow<Project>(TABLE)
