import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { table, type TrashMode } from './table'

// Generic TanStack Query hooks over a mapped table. Query key is [name, filter, trashed];
// any mutation invalidates the whole [name] prefix so lists (active + trashed) refetch.

export function useRows<T>(name: string, filter?: Record<string, unknown>, opts?: { trashed?: TrashMode }) {
  const trashed = opts?.trashed ?? 'exclude'
  return useQuery({
    queryKey: [name, filter ?? null, trashed],
    queryFn: () => table<T>(name).list(filter, { trashed }),
  })
}

export function useCreateRow<T>(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<T>) => table<T>(name).create(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  })
}

export function useUpdateRow<T>(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { id: string; patch: Partial<T> }) => table<T>(name).update(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  })
}

/** Soft-delete (sets deleted_at). The row moves to Trash, recoverable via useRestoreRow. */
export function useRemoveRow(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => table(name).remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  })
}

/** Undo a soft-delete (clears deleted_at). */
export function useRestoreRow(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => table(name).restore(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  })
}

/** Permanent delete (Trash → "Delete forever"). */
export function usePurgeRow(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => table(name).purge(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  })
}
