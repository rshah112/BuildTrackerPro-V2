// Treasury math: how draw cash moves from the loan, through your bank account, out to the
// parties who fronted the work.
//
// THE RULE THIS FILE EXISTS TO HOLD:
// a reimbursement is a CASH movement, never a project COST. Nothing here feeds
// lib/budgetAggregates, lib/financialSummary, or features/cashflow — those derive actuals from
// `expenses` alone. Repaying yourself $6,500 for the architect leaves the project's cost at
// $6,500, not $13,000; it only moves your out-of-pocket balance to zero.
//
// The governing identity, per party:
//   owed(party) = Σ effective cash paid on expenses that party fronted − Σ disbursements to party

import { cents, dollars, sumBy } from '../../lib/money'
import { effectiveAmountPaid } from '../../lib/expenseMath'
import { createsObligation, normalizeFundingSource, type FundingSource } from '../../domain/enums'

export interface TreasuryExpense {
  id: string
  amount: number
  amountPaid: number
  isPaid: boolean
  vendorName: string
  categoryName: string
  date: string
  /** Origin — whose cash left first. See FUNDING_SOURCES. */
  fundingSource?: string
}

export interface TreasuryDisbursement {
  id: string
  drawId: string
  partyType: string
  vendorId?: string | null
  partyName: string
  amount: number
  disbursedDate: string
}

export interface TreasuryAllocation {
  disbursementId: string
  expenseId: string
  amount: number
}

export interface TreasuryDrawLike {
  id: string
  amount: number
  feesAmount?: number
  status?: string
  drawDate: string
  description?: string
}

// ---------------------------------------------------------------------------
// Draw-side: what a draw delivered and how much of it is still sitting in the account.
// ---------------------------------------------------------------------------

/** Cash a draw actually delivered: principal less lender fees netted out of the wire.
 *  A draw that isn't funded yet has delivered nothing. */
export function drawNetFunded(draw: TreasuryDrawLike): number {
  if ((draw.status ?? 'funded') !== 'funded') return 0
  return dollars(Math.max(0, cents(draw.amount) - cents(draw.feesAmount ?? 0)))
}

export function disbursedFromDraw(drawId: string, disbursements: TreasuryDisbursement[]): number {
  return sumBy(
    disbursements.filter((d) => d.drawId === drawId),
    (d) => d.amount,
  )
}

/** Draw cash still in your personal account — not yet paid out to anyone. This is real,
 *  spendable money, and it's what pays the next interest bill before personal funds do. */
export function undisbursedFromDraw(draw: TreasuryDrawLike, disbursements: TreasuryDisbursement[]): number {
  return dollars(Math.max(0, cents(drawNetFunded(draw)) - cents(disbursedFromDraw(draw.id, disbursements))))
}

export interface DrawCashSummary {
  drawId: string
  netFunded: number
  disbursed: number
  undisbursed: number
}

export function drawCashSummaries(
  draws: TreasuryDrawLike[],
  disbursements: TreasuryDisbursement[],
): DrawCashSummary[] {
  return draws.map((draw) => ({
    drawId: draw.id,
    netFunded: drawNetFunded(draw),
    disbursed: disbursedFromDraw(draw.id, disbursements),
    undisbursed: undisbursedFromDraw(draw, disbursements),
  }))
}

/** Total undisbursed draw cash across every funded draw. */
export function cashOnHand(draws: TreasuryDrawLike[], disbursements: TreasuryDisbursement[]): number {
  return sumBy(drawCashSummaries(draws, disbursements), (s) => s.undisbursed)
}

// ---------------------------------------------------------------------------
// Expense-side: how much of each expense has been settled out of a draw.
// ---------------------------------------------------------------------------

export type ReimbursementState = 'not_applicable' | 'unreimbursed' | 'partial' | 'reimbursed'

export interface ExpenseSettlement {
  expenseId: string
  /** Cash actually laid out for this expense — the ceiling on what can be reimbursed. */
  reimbursable: number
  reimbursed: number
  outstanding: number
  state: ReimbursementState
  origin: FundingSource
}

/** Sum of allocations pointing at one expense. Allocations for expenses that no longer exist
 *  are ignored by the callers below, which iterate over live expenses. */
export function reimbursedForExpense(expenseId: string, allocations: TreasuryAllocation[]): number {
  return sumBy(
    allocations.filter((a) => a.expenseId === expenseId),
    (a) => a.amount,
  )
}

export function expenseSettlement(
  expense: TreasuryExpense,
  allocations: TreasuryAllocation[],
): ExpenseSettlement {
  const origin = normalizeFundingSource(expense.fundingSource)
  // Loan-direct and draw-funded costs were never fronted by anyone, so there is nothing to
  // reimburse — allocations against them only trace which draw's cash they consumed.
  const reimbursable = createsObligation(origin) ? effectiveAmountPaid(expense) : 0
  const reimbursed = Math.min(cents(reimbursable), cents(reimbursedForExpense(expense.id, allocations)))
  const outstanding = Math.max(0, cents(reimbursable) - reimbursed)

  const state: ReimbursementState = !createsObligation(origin)
    ? 'not_applicable'
    : reimbursable <= 0
      ? 'not_applicable'
      : outstanding === 0
        ? 'reimbursed'
        : reimbursed > 0
          ? 'partial'
          : 'unreimbursed'

  return {
    expenseId: expense.id,
    reimbursable,
    reimbursed: dollars(reimbursed),
    outstanding: dollars(outstanding),
    state,
    origin,
  }
}

export function expenseSettlements(
  expenses: TreasuryExpense[],
  allocations: TreasuryAllocation[],
): Map<string, ExpenseSettlement> {
  return new Map(expenses.map((e) => [e.id, expenseSettlement(e, allocations)]))
}

// ---------------------------------------------------------------------------
// Party-side: who is owed what right now.
// ---------------------------------------------------------------------------

export interface PartyBalance {
  key: string
  label: string
  /** Cash this party laid out on the project. */
  fronted: number
  /** Cash already returned to them out of draws. */
  reimbursed: number
  /** fronted − reimbursed, never negative. */
  owed: number
  expenseCount: number
}

export interface OwedSummary {
  you: PartyBalance
  builder: PartyBalance
  /** Unpaid subs — an invoice balance, not a reimbursement: nobody fronted this yet. */
  unpaidVendors: PartyBalance[]
  unpaidVendorTotal: number
  /** you.owed + builder.owed — what draw cash has to cover to square everyone up. */
  totalOwedForFrontedCash: number
}

const FRONTED_LABEL: Record<string, string> = {
  owner_personal: 'You',
  builder: 'Builder',
}

function partyBalance(
  key: 'owner_personal' | 'builder',
  expenses: TreasuryExpense[],
  settlements: Map<string, ExpenseSettlement>,
): PartyBalance {
  const mine = expenses.filter((e) => normalizeFundingSource(e.fundingSource) === key)
  const fronted = sumBy(mine, (e) => settlements.get(e.id)?.reimbursable ?? 0)
  const reimbursed = sumBy(mine, (e) => settlements.get(e.id)?.reimbursed ?? 0)
  return {
    key,
    label: FRONTED_LABEL[key],
    fronted,
    reimbursed,
    owed: dollars(Math.max(0, cents(fronted) - cents(reimbursed))),
    expenseCount: mine.filter((e) => (settlements.get(e.id)?.outstanding ?? 0) > 0).length,
  }
}

/**
 * "Who is owed what right now."
 *
 * Two genuinely different kinds of debt live here and are deliberately not summed together:
 *  - You and the builder are owed REIMBURSEMENT for cash already spent. The cost is already
 *    in the budget; only the cash is outstanding.
 *  - Unpaid subs are owed PAYMENT on invoices. That cost is also already in the budget, but
 *    nobody has laid the cash out yet, so it is not a reimbursement.
 */
export function owedSummary(
  expenses: TreasuryExpense[],
  allocations: TreasuryAllocation[],
): OwedSummary {
  const settlements = expenseSettlements(expenses, allocations)
  const you = partyBalance('owner_personal', expenses, settlements)
  const builder = partyBalance('builder', expenses, settlements)

  // Outstanding invoice balances, grouped by vendor. Nothing was fronted here.
  const byVendor = new Map<string, PartyBalance>()
  for (const expense of expenses) {
    const due = dollars(Math.max(0, cents(expense.amount) - cents(effectiveAmountPaid(expense))))
    if (due <= 0) continue
    const name = expense.vendorName.trim() || 'Unnamed vendor'
    const existing = byVendor.get(name)
    if (existing) {
      existing.owed = dollars(cents(existing.owed) + cents(due))
      existing.expenseCount += 1
    } else {
      byVendor.set(name, { key: name, label: name, fronted: 0, reimbursed: 0, owed: due, expenseCount: 1 })
    }
  }
  const unpaidVendors = [...byVendor.values()].sort((a, b) => b.owed - a.owed)

  return {
    you,
    builder,
    unpaidVendors,
    unpaidVendorTotal: sumBy(unpaidVendors, (v) => v.owed),
    totalOwedForFrontedCash: dollars(cents(you.owed) + cents(builder.owed)),
  }
}

// ---------------------------------------------------------------------------
// Disbursement-side: how much of a disbursement is explained by allocations.
// ---------------------------------------------------------------------------

export interface DisbursementSummary {
  disbursementId: string
  amount: number
  allocated: number
  /** Cash handed over that isn't tied to a specific expense yet — an advance/float, not an error. */
  unallocated: number
}

export function disbursementSummary(
  disbursement: TreasuryDisbursement,
  allocations: TreasuryAllocation[],
): DisbursementSummary {
  const allocated = sumBy(
    allocations.filter((a) => a.disbursementId === disbursement.id),
    (a) => a.amount,
  )
  return {
    disbursementId: disbursement.id,
    amount: disbursement.amount,
    allocated,
    unallocated: dollars(Math.max(0, cents(disbursement.amount) - cents(allocated))),
  }
}

/**
 * Suggested default origin for an interest payment, following the stated plan: pay interest
 * out of leftover draw cash when there is any, otherwise out of personal funds.
 */
export function interestFundingDefault(
  interestDue: number,
  draws: TreasuryDrawLike[],
  disbursements: TreasuryDisbursement[],
): FundingSource {
  return cents(cashOnHand(draws, disbursements)) >= cents(interestDue) && interestDue > 0
    ? 'owner_draw'
    : 'owner_personal'
}
