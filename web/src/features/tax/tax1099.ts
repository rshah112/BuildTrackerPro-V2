import type { Expense, Vendor } from '../../domain/types'
import { effectiveAmountPaid } from '../../lib/expenseMath'
import { cents, dollars } from '../../lib/money'

export interface Vendor1099Candidate {
  key: string
  vendor: string
  vendorIds: string[]
  eligiblePaid: number
  paymentCount: number
  excludedNetworkPaid: number
  excludedNetworkCount: number
  missingPaidDateCount: number
  partialPaymentCount: number
  hasTaxId: boolean
  candidate: boolean
}

/** Threshold used to surface review candidates. This is not a filing determination.
 * The 2026 federal 1099-NEC threshold is $2,000; prior years use $600. Congress made
 * post-2026 amounts inflation-adjustable, so future-year UI copy calls for a fresh review. */
export function candidateThresholdForYear(year: number): number {
  return year >= 2026 ? 2_000 : 600
}

const normName = (value: string) => value.trim().toLocaleLowerCase()
const vendorNameKey = (projectId: string, name: string) => `${projectId}\u0000${normName(name)}`

/** Payment-card and third-party settlement methods are generally reported by the network
 * on Form 1099-K, rather than included in the payer's 1099-NEC candidate total. Because
 * payment_method is free text, keep this deliberately recognizable and testable. */
export function isPaymentNetworkMethod(method: string | null | undefined): boolean {
  const value = (method ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[._/-]+/g, ' ')
    .replace(/\s+/g, ' ')
  if (!value) return false
  return (
    /\b(?:credit|debit|payment) card\b/.test(value) ||
    /\bcard\b/.test(value) ||
    /\b(?:paypal|venmo|cash app|stripe|square|apple pay|google pay)\b/.test(value)
  )
}

interface Accumulator {
  key: string
  name: string
  vendorIds: Set<string>
  eligibleCents: number
  eligibleCount: number
  networkCents: number
  networkCount: number
  missingPaidDateCount: number
  partialPaymentCount: number
  hasTaxId: boolean
}

/** Cash-basis, portfolio-wide vendor payment candidates for a tax-year review.
 *
 * - Uses actual cash paid, bucketed by paid date (expense date is an explicit fallback).
 * - Resolves vendorId to the current vendor profile so renames do not split history.
 * - Consolidates project-specific vendor profiles by a complete 9-digit tax id when present,
 *   otherwise by normalized current vendor name across the portfolio.
 * - Separately shows, but does not count, recognized card/payment-network payments.
 *
 * The result intentionally says `candidate`, not `reportable`: entity classification,
 * exemptions, payment purpose, and W-9 facts still require human review. */
export function vendor1099Rollup(expenses: Expense[], year: number, vendors: Vendor[] = []): Vendor1099Candidate[] {
  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]))
  const vendorByProjectAndName = new Map(
    vendors.map((vendor) => [vendorNameKey(vendor.projectId, vendor.name), vendor] as const),
  )
  const taxKeysByName = new Map<string, Set<string>>()
  for (const vendor of vendors) {
    const taxDigits = (vendor.taxId ?? '').replace(/\D/g, '')
    if (taxDigits.length !== 9) continue
    const name = normName(vendor.name)
    const keys = taxKeysByName.get(name) ?? new Set<string>()
    keys.add(`tax:${taxDigits}`)
    taxKeysByName.set(name, keys)
  }
  const uniqueTaxKeyByName = new Map(
    [...taxKeysByName].flatMap(([name, keys]) => (keys.size === 1 ? [[name, [...keys][0]] as const] : [])),
  )
  const byVendor = new Map<string, Accumulator>()

  for (const expense of expenses) {
    const paid = effectiveAmountPaid(expense)
    if (paid <= 0) continue

    const paidDate = expense.paidDate?.slice(0, 10)
    const bucketDate = paidDate || expense.date?.slice(0, 10)
    if (!bucketDate || Number(bucketDate.slice(0, 4)) !== year) continue

    const snapshotName = (expense.vendorName || '').trim()
    const profile =
      (expense.vendorId ? vendorById.get(expense.vendorId) : undefined) ??
      vendorByProjectAndName.get(vendorNameKey(expense.projectId, snapshotName))
    const name = profile?.name.trim() || snapshotName
    if (!name) continue

    // Only a complete EIN/SSN is stable enough to merge differently-named profiles. A partial
    // or masked id is useful for W-9 presence, but unsafe as a cross-project grouping key.
    const taxDigits = (profile?.taxId ?? '').replace(/\D/g, '')
    const normalizedName = normName(name)
    const key =
      taxDigits.length === 9
        ? `tax:${taxDigits}`
        : uniqueTaxKeyByName.get(normalizedName) ?? `name:${normalizedName}`
    const current = byVendor.get(key) ?? {
      key,
      name,
      vendorIds: new Set<string>(),
      eligibleCents: 0,
      eligibleCount: 0,
      networkCents: 0,
      networkCount: 0,
      missingPaidDateCount: 0,
      partialPaymentCount: 0,
      hasTaxId: false,
    }

    if (profile) {
      current.vendorIds.add(profile.id)
      current.hasTaxId ||= (profile.taxId ?? '').trim().length > 0
    }
    if (!paidDate) current.missingPaidDateCount += 1
    if (cents(paid) < cents(expense.amount)) current.partialPaymentCount += 1
    if (isPaymentNetworkMethod(expense.paymentMethod)) {
      current.networkCents += cents(paid)
      current.networkCount += 1
    } else {
      current.eligibleCents += cents(paid)
      current.eligibleCount += 1
    }
    byVendor.set(key, current)
  }

  const thresholdCents = cents(candidateThresholdForYear(year))
  return [...byVendor.values()]
    .map((vendor) => ({
      key: vendor.key,
      vendor: vendor.name,
      vendorIds: [...vendor.vendorIds],
      eligiblePaid: dollars(vendor.eligibleCents),
      paymentCount: vendor.eligibleCount,
      excludedNetworkPaid: dollars(vendor.networkCents),
      excludedNetworkCount: vendor.networkCount,
      missingPaidDateCount: vendor.missingPaidDateCount,
      partialPaymentCount: vendor.partialPaymentCount,
      hasTaxId: vendor.hasTaxId,
      candidate: vendor.eligibleCents >= thresholdCents,
    }))
    .sort(
      (a, b) =>
        b.eligiblePaid - a.eligiblePaid ||
        b.excludedNetworkPaid - a.excludedNetworkPaid ||
        a.vendor.localeCompare(b.vendor),
    )
}
