import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { table } from './table'

// Generic TanStack Query hooks over a mapped table. Query key is [name, filter];
// any mutation invalidates the whole [name] prefix so lists refetch.

export function useRows<T>(name: string, filter?: Record<string, unknown>) {
  return useQuery({
    queryKey: [name, filter ?? null],
    queryFn: () => table<T>(name).list(filter),
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

export function useRemoveRow(name: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => table(name).remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [name] }),
  })
}
