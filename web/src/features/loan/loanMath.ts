import { cents, dollars, sumBy } from '../../lib/money'

// Construction-loan math. The loan is interest-only: each month you pay interest on the
// amount drawn so far, not the full facility. Rate is an annual percent.

export interface LoanDrawLike {
  amount: number
  drawDate: string // ISO
}

/** Total drawn to date (cent-exact). */
export function drawnTotal(draws: LoanDrawLike[]): number {
  return dollars(cents(sumBy(draws, (d) => d.amount)))
}

/** Facility still available to draw (never negative). */
export function availableCredit(totalAmount: number, draws: LoanDrawLike[]): number {
  return dollars(Math.max(0, cents(totalAmount) - cents(drawnTotal(draws))))
}

/** Fraction of the facility drawn, 0..1. */
export function utilization(totalAmount: number, draws: LoanDrawLike[]): number {
  if (totalAmount <= 0) return 0
  return Math.min(1, Math.max(0, drawnTotal(draws) / totalAmount))
}

/** This month's interest-only payment on the current drawn balance. */
export function monthlyInterest(drawnBalance: number, annualRatePct: number): number {
  if (annualRatePct <= 0) return 0
  return dollars(Math.round(cents(drawnBalance) * (annualRatePct / 100 / 12)))
}

/** Local midnight (ms) for the calendar date portion of an ISO string, so day counts
 *  don't drift with the stored timestamptz's UTC offset. */
function localMidnight(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** Approximate interest accrued to date: each draw accrues from its draw date to `today`
 *  at the annual rate (actual/365). A planning estimate, not a lender statement. Day counts
 *  are computed on calendar dates (local), so a midnight-UTC draw_date doesn't shift them. */
export function interestAccruedToDate(draws: LoanDrawLike[], annualRatePct: number, today: Date): number {
  if (annualRatePct <= 0) return 0
  const dayRate = annualRatePct / 100 / 365
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  let total = 0
  for (const d of draws) {
    const days = Math.max(0, Math.round((todayMid - localMidnight(d.drawDate)) / 86_400_000))
    total += cents(d.amount) * dayRate * days
  }
  return dollars(Math.round(total))
}
