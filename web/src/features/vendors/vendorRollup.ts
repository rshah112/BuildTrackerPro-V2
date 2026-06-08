import type { Bid, Expense, ProjectTask, Vendor } from '../../domain/types'
import { balanceDue, effectiveAmountPaid } from '../../lib/expenseMath'
import { sumBy } from '../../lib/money'

export interface VendorRollup {
  invoiced: number
  paid: number
  open: number
  expenses: Expense[]
  bids: Bid[]
  tasks: ProjectTask[]
}

const norm = (s: string) => s.trim().toLowerCase()

/** Everything tied to a vendor: expenses matched by name (case-insensitive — expenses link by
 *  name), plus bids and tasks linked by vendorId (or bid name). Expenses drive the spend totals,
 *  all cent-exact via lib/money. Powers the Vendor 360 profile. */
export function vendorRollup(vendor: Vendor, expenses: Expense[], bids: Bid[], tasks: ProjectTask[]): VendorRollup {
  const name = norm(vendor.name)
  const ven = expenses.filter((e) => norm(e.vendorName) === name)
  return {
    invoiced: sumBy(ven, (e) => e.amount),
    paid: sumBy(ven, (e) => effectiveAmountPaid(e)),
    open: sumBy(ven, (e) => balanceDue(e)),
    expenses: ven,
    bids: bids.filter((b) => b.vendorId === vendor.id || norm(b.vendorName) === name),
    tasks: tasks.filter((t) => t.vendorId === vendor.id),
  }
}
