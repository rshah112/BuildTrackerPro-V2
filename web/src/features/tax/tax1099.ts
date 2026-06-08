import type { Expense } from '../../domain/types'
import { effectiveAmountPaid } from '../../lib/expenseMath'
import { cents, dollars } from '../../lib/money'

export interface Vendor1099 {
  vendor: string
  paid: number
  count: number
  reportable: boolean
}

/** IRS 1099-NEC threshold: payments of $600 or more to a vendor in a calendar year. */
export const REPORTABLE_THRESHOLD = 600

/** Cash-basis 1099 prep: total actually PAID to each vendor during `year` (grouped case-insensitively
 *  by vendor name, bucketed by paid date — falling back to the expense date when no paid date is set),
 *  with vendors at/above the $600 threshold flagged. Sorted high to low. Cent-exact via lib/money. */
export function vendor1099Rollup(expenses: Expense[], year: number): Vendor1099[] {
  const byVendor = new Map<string, { name: string; cents: number; count: number }>()
  for (const e of expenses) {
    const paid = effectiveAmountPaid(e)
    if (paid <= 0) continue
    const iso = e.paidDate ?? e.date
    if (!iso || Number(iso.slice(0, 4)) !== year) continue
    const name = (e.vendorName || '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    const cur = byVendor.get(key) ?? { name, cents: 0, count: 0 }
    cur.cents += cents(paid)
    cur.count += 1
    byVendor.set(key, cur)
  }
  const threshold = cents(REPORTABLE_THRESHOLD)
  return [...byVendor.values()]
    .map((v) => ({ vendor: v.name, paid: dollars(v.cents), count: v.count, reportable: v.cents >= threshold }))
    .sort((a, b) => b.paid - a.paid)
}
