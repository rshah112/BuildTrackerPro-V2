import { cents, dollars, sumBy } from '../../lib/money'

// Construction-loan math. The loan is interest-only: each month you pay interest on the
// amount drawn so far, not the full facility. Rate is an annual percent.

export interface LoanDrawLike {
  amount: number
  drawDate: string // ISO
}

/** A draw with its lifecycle state. Rows created before the lifecycle existed have no
 *  `status` and are treated as funded, so historical balances are unchanged. */
export interface LoanDrawStatusLike {
  status?: string
}

/**
 * Only a FUNDED draw has actually moved money, so only funded draws may count toward the
 * loan balance, interest, facility utilization, or available cash. Requested and approved
 * draws are pipeline — real, but not yet money.
 */
export function fundedDraws<T extends LoanDrawStatusLike>(draws: T[]): T[] {
  return draws.filter((d) => (d.status ?? 'funded') === 'funded')
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

/** Day-count convention. Worth roughly 1.4% on the interest figure — actual/365 charges for
 *  365 days a year at a 1/365 daily rate, 30/360 charges 360 days at a 1/360 rate. */
export type InterestBasisLike = 'actual/365' | '30/360' | string

const pad2 = (n: number) => String(n).padStart(2, '0')
const parts = (iso: string) => iso.slice(0, 10).split('-').map(Number) as [number, number, number]

/** Fraction of a year between two calendar dates under the given convention. Never negative. */
export function dayCountFraction(fromISO: string, toISO: string, basis: InterestBasisLike = 'actual/365'): number {
  if (basis === '30/360') {
    const [y1, m1, d1] = parts(fromISO)
    const [y2, m2, d2] = parts(toISO)
    // 30E/360: both endpoints clamped to 30, which is what construction lenders quote.
    const days = (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30))
    return Math.max(0, days) / 360
  }
  const days = Math.max(0, Math.round((localMidnight(toISO) - localMidnight(fromISO)) / 86_400_000))
  return days / 365
}

/** Approximate interest accrued to date: each draw accrues from its draw date to `today`
 *  at the annual rate. A planning estimate, not a lender statement. Day counts are computed
 *  on calendar dates (local), so a midnight-UTC draw_date doesn't shift them.
 *
 *  Pass only FUNDED draws — an approved-but-unfunded draw has not moved money and accrues
 *  nothing. `fundedDraws()` does that filtering. */
export function interestAccruedToDate(
  draws: LoanDrawLike[],
  annualRatePct: number,
  today: Date,
  basis: InterestBasisLike = 'actual/365',
): number {
  if (annualRatePct <= 0) return 0
  const todayISO = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
  let total = 0
  for (const d of draws) {
    total += cents(d.amount) * (annualRatePct / 100) * dayCountFraction(d.drawDate, todayISO, basis)
  }
  return dollars(Math.round(total))
}

// ---------------------------------------------------------------------------
// Loan terms: maturity and the projected carrying cost over the full term.
// ---------------------------------------------------------------------------

export interface LoanTermsLike {
  totalAmount: number
  interestRate: number
  startDate?: string | null
  termMonths?: number
  maturityDate?: string | null
  interestBasis?: string
}

/** Add whole months to a yyyy-mm-dd date, clamping to the target month's last day
 *  (Jan 31 + 1 month = Feb 28/29, never Mar 3). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = parts(iso)
  const target = new Date(y, m - 1 + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(Math.min(d, lastDay))}`
}

/** Add whole days to a yyyy-mm-dd date in the local calendar. */
export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = parts(iso)
  const shifted = new Date(y, m - 1, d + days)
  return `${shifted.getFullYear()}-${pad2(shifted.getMonth() + 1)}-${pad2(shifted.getDate())}`
}

/** Explicit maturity when the lender set one, else startDate + termMonths. Null when unknown. */
export function resolvedMaturity(loan: LoanTermsLike): string | null {
  if (loan.maturityDate) return loan.maturityDate.slice(0, 10)
  if (!loan.startDate || !loan.termMonths || loan.termMonths <= 0) return null
  return addMonths(loan.startDate.slice(0, 10), loan.termMonths)
}

/** Whole days from `today` to maturity; negative once maturity has passed. */
export function daysToMaturity(loan: LoanTermsLike, today: Date): number | null {
  const maturity = resolvedMaturity(loan)
  if (!maturity) return null
  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.round((localMidnight(maturity) - todayMid) / 86_400_000)
}

export type MaturityStatus = 'unset' | 'ok' | 'approaching' | 'due' | 'past'

/** Escalating flag so the dashboard can warn before a 15-month term runs out: refinancing
 *  or extending a construction loan takes months, so 90 days is the first warning. */
export function maturityStatus(loan: LoanTermsLike, today: Date): MaturityStatus {
  const days = daysToMaturity(loan, today)
  if (days == null) return 'unset'
  if (days < 0) return 'past'
  if (days <= 30) return 'due'
  if (days <= 90) return 'approaching'
  return 'ok'
}

export interface InterestMonth {
  /** 1-based month within the term. */
  index: number
  monthStart: string
  monthEnd: string
  openingBalance: number
  /** Balance added during the month (recorded draws for past months, assumed for future ones). */
  drawsInMonth: number
  closingBalance: number
  interest: number
  /** True when the month is entirely in the past and uses only recorded funded draws. */
  actual: boolean
}

export interface InterestProjection {
  months: InterestMonth[]
  /** Carrying cost across the whole term under the draw assumption below. */
  totalInterest: number
  /** Day-count-precise interest on recorded funded draws through today. */
  interestToDate: number
  /** totalInterest less interestToDate, never negative. */
  remainingInterest: number
  peakBalance: number
  peakMonthlyInterest: number
  /** Facility assumed still to be drawn, spread evenly across the remaining months. */
  assumedRemainingDraws: number
}

const EMPTY_PROJECTION: InterestProjection = {
  months: [],
  totalInterest: 0,
  interestToDate: 0,
  remainingInterest: 0,
  peakBalance: 0,
  peakMonthlyInterest: 0,
  assumedRemainingDraws: 0,
}

/**
 * Month-by-month interest over the interest-only term, so the real carrying cost of the
 * facility is visible rather than just today's payment.
 *
 * Draw assumption, stated plainly because it drives the number: whatever facility remains
 * undrawn is assumed to be drawn EVENLY across the remaining months of the term.
 *
 * Interest is computed two different ways on purpose, because only one of them is a guess:
 *  - RECORDED draws accrue day-exactly from their own draw date to the end of the month,
 *    matching interestAccruedToDate. A facility drawn in full on day one is charged for the
 *    whole first month, not half of it.
 *  - ASSUMED future draws have no known date, so they use the average of the month's opening
 *    and closing assumed balance — the standard approximation for a mid-month step-up.
 *
 * Averaging the recorded draws too (the obvious shortcut) understates the first month of
 * every real draw by half, and makes the schedule disagree with `interestToDate`.
 */
export function projectInterest(
  loan: LoanTermsLike,
  draws: LoanDrawLike[],
  today: Date,
): InterestProjection {
  const start = loan.startDate?.slice(0, 10)
  const term = loan.termMonths ?? 0
  const basis = loan.interestBasis ?? 'actual/365'
  const interestToDate = interestAccruedToDate(draws, loan.interestRate, today, basis)
  if (!start || term <= 0 || loan.interestRate <= 0) {
    return { ...EMPTY_PROJECTION, interestToDate }
  }

  const todayISO = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`
  const drawnCents = draws.reduce((total, d) => total + cents(d.amount), 0)
  const facilityCents = cents(loan.totalAmount)
  const remainingCents = Math.max(0, facilityCents - drawnCents)

  // Which term month is today in? -1 when the term hasn't started, term when it's over.
  let currentIndex = -1
  for (let i = 0; i < term; i += 1) {
    if (addMonths(start, i) <= todayISO) currentIndex = i
  }
  if (todayISO >= addMonths(start, term)) currentIndex = term

  const futureMonths = Math.max(0, term - 1 - currentIndex)
  const assumedRemainingCents = futureMonths > 0 ? remainingCents : 0

  const months: InterestMonth[] = []
  let openingCents = 0
  let totalInterestCents = 0
  let peakBalanceCents = 0
  let peakInterestCents = 0

  for (let i = 0; i < term; i += 1) {
    const monthStart = addMonths(start, i)
    const nextStart = addMonths(start, i + 1)
    const monthEnd = addDaysISO(nextStart, -1)

    // Recorded funded draws land in the month containing their draw date.
    const recordedCents = draws.reduce(
      (total, d) => (d.drawDate.slice(0, 10) < nextStart ? total + cents(d.amount) : total),
      0,
    )
    // Recorded balance already standing when the month opened — used to separate the recorded
    // part of the balance (charged day-exactly) from the assumed part (charged on average).
    const recordedOpeningCents = draws.reduce(
      (total, d) => (d.drawDate.slice(0, 10) < monthStart ? total + cents(d.amount) : total),
      0,
    )
    const projectedCents =
      i > currentIndex && futureMonths > 0
        ? Math.round((assumedRemainingCents * Math.min(i - currentIndex, futureMonths)) / futureMonths)
        : 0
    const closingCents = Math.min(facilityCents, recordedCents + projectedCents)

    const fraction = dayCountFraction(monthStart, nextStart, basis)
    // Recorded draws: day-exact from the later of the draw date and the month start, so a
    // draw taken on day one is charged for the full month and the schedule agrees with
    // interestAccruedToDate.
    let interest = 0
    for (const d of draws) {
      const drawDay = d.drawDate.slice(0, 10)
      if (drawDay >= nextStart) continue
      const from = drawDay > monthStart ? drawDay : monthStart
      interest += cents(d.amount) * (loan.interestRate / 100) * dayCountFraction(from, nextStart, basis)
    }
    // Assumed future draws have no date, so the mid-month average is the best available.
    const assumedOpening = Math.max(0, openingCents - Math.min(openingCents, recordedOpeningCents))
    const assumedClosing = Math.max(0, closingCents - Math.min(closingCents, recordedCents))
    interest += ((assumedOpening + assumedClosing) / 2) * (loan.interestRate / 100) * fraction
    const interestCents = Math.round(interest)

    months.push({
      index: i + 1,
      monthStart,
      monthEnd,
      openingBalance: dollars(openingCents),
      drawsInMonth: dollars(closingCents - openingCents),
      closingBalance: dollars(closingCents),
      interest: dollars(interestCents),
      actual: nextStart <= todayISO,
    })

    totalInterestCents += interestCents
    peakBalanceCents = Math.max(peakBalanceCents, closingCents)
    peakInterestCents = Math.max(peakInterestCents, interestCents)
    openingCents = closingCents
  }

  return {
    months,
    totalInterest: dollars(totalInterestCents),
    interestToDate,
    remainingInterest: dollars(Math.max(0, totalInterestCents - cents(interestToDate))),
    peakBalance: dollars(peakBalanceCents),
    peakMonthlyInterest: dollars(peakInterestCents),
    assumedRemainingDraws: dollars(assumedRemainingCents),
  }
}
