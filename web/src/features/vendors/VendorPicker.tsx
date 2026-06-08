import { useMemo } from 'react'
import type { Vendor } from '../../domain/types'
import { Combobox, type ComboOption } from '../../components/ui/Combobox'

/** Shared vendor-name picker: suggests saved vendors (with their trade as a hint) plus any extra
 *  names the caller knows about (e.g. names used on past expenses), and accepts a brand-new name
 *  the caller will auto-create on save. Used by Expenses, Bids, and Allowances so vendor entry is
 *  consistent everywhere instead of three different inputs. */
export function VendorPicker({
  label = 'Vendor',
  value,
  vendors,
  extraNames = [],
  onChange,
  placeholder = 'Search or add a vendor',
  hint = 'New names are saved to Vendors automatically — add contact info anytime.',
}: {
  label?: string
  value: string
  vendors: Vendor[]
  extraNames?: string[]
  onChange: (name: string) => void
  placeholder?: string
  hint?: string
}) {
  const options = useMemo<ComboOption[]>(() => {
    const map = new Map<string, string | undefined>()
    for (const v of vendors) if (v.name) map.set(v.name, v.trade || undefined)
    for (const n of extraNames) if (n && !map.has(n)) map.set(n, undefined)
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, trade]) => ({ value: name, label: name, hint: trade }))
  }, [vendors, extraNames])

  return (
    <Combobox
      label={label}
      value={value}
      options={options}
      onChange={onChange}
      allowCustom
      placeholder={placeholder}
      hint={hint}
    />
  )
}
