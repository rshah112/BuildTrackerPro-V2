import { useCallback } from 'react'
import type { Vendor } from '../../domain/types'
import { useVendors, useCreateVendor } from './useVendors'

/** Case-insensitive, trim-tolerant lookup of a vendor by name. Pure so it's unit-testable and
 *  reused by the auto-create hook and the Vendor 360 spend rollup. */
export function findVendorByName<T extends { name: string }>(vendors: T[], name: string): T | undefined {
  const clean = name.trim().toLowerCase()
  if (!clean) return undefined
  return vendors.find((v) => v.name.trim().toLowerCase() === clean)
}

/** Returns a function that ensures a vendor record exists for a typed name: returns the existing
 *  (case-insensitive) match, or creates a name-only vendor the user can flesh out later on the
 *  Vendors tab. Lets you type a vendor on an expense/bid/allowance and have it become a real,
 *  editable profile instead of a dead string. */
export function useEnsureVendor(projectId: string) {
  const { data: vendors = [] } = useVendors(projectId)
  const create = useCreateVendor()
  return useCallback(
    async (name: string | undefined | null, opts?: { trade?: string }): Promise<Vendor | null> => {
      const clean = name?.trim()
      if (!clean) return null
      const existing = findVendorByName(vendors, clean)
      if (existing) return existing
      return await create.mutateAsync({
        projectId,
        name: clean,
        trade: opts?.trade ?? '',
        phone: '',
        email: '',
        notes: '',
      } as Partial<Vendor>)
    },
    [vendors, create, projectId],
  )
}
