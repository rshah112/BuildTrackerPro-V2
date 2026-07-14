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

/** Everything tied to a vendor. Stable vendor IDs win when present; normalized names are only
 *  a fallback for legacy rows without an ID. Expenses drive the spend totals, all cent-exact via
 *  lib/money. Powers the Vendor 360 profile. */
export function vendorRollup(vendor: Vendor, expenses: Expense[], bids: Bid[], tasks: ProjectTask[]): VendorRollup {
  const name = norm(vendor.name)
  const ven = expenses.filter((expense) =>
    expense.vendorId ? expense.vendorId === vendor.id : norm(expense.vendorName) === name,
  )
  return {
    invoiced: sumBy(ven, (e) => e.amount),
    paid: sumBy(ven, (e) => effectiveAmountPaid(e)),
    open: sumBy(ven, (e) => balanceDue(e)),
    expenses: ven,
    bids: bids.filter((bid) =>
      bid.vendorId ? bid.vendorId === vendor.id : norm(bid.vendorName) === name,
    ),
    tasks: tasks.filter((t) => t.vendorId === vendor.id),
  }
}
