import { useRows, useCreateRow, useUpdateRow } from '../../data/hooks'
import type { Project } from '../../domain/types'

const TABLE = 'projects'

// All of the owner's projects (RLS-scoped). Split into active vs trash by deletedAt.
export const useProjects = () => useRows<Project>(TABLE)
export const useCreateProject = () => useCreateRow<Project>(TABLE)
export const useUpdateProject = () => useUpdateRow<Project>(TABLE)
