import { describe, it, expect } from 'vitest'
import { findVendorByName } from './useEnsureVendor'

const v = (name: string) => ({ id: name, name })

describe('findVendorByName', () => {
  it('matches case-insensitively and tolerates surrounding whitespace', () => {
    const vendors = [v('Smith Plumbing'), v('Acme Electric')]
    expect(findVendorByName(vendors, 'smith plumbing')?.id).toBe('Smith Plumbing')
    expect(findVendorByName(vendors, '  ACME ELECTRIC ')?.id).toBe('Acme Electric')
  })

  it('returns undefined for no match or an empty name', () => {
    const vendors = [v('Smith Plumbing')]
    expect(findVendorByName(vendors, 'Jones HVAC')).toBeUndefined()
    expect(findVendorByName(vendors, '   ')).toBeUndefined()
    expect(findVendorByName([], 'Anyone')).toBeUndefined()
  })
})
