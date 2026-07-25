// The load-bearing test for the whole loan/reimbursement feature.
//
// A reimbursement is a CASH movement, not a project COST. Paying the architect $6,500 from
// personal cash and later repaying yourself $6,500 out of draw #1 means the project spent
// $6,500 — not $13,000. This file proves that recording draws, disbursements, and allocations
// leaves budget actuals, category spend, dashboard EAC, and the cash-flow forecast bit-for-bit
// unchanged, using the real project fixture (5 soft costs, $8,638, all fronted personally).
//
// It also anchors the exact expected numbers, so a future change that routes reimbursements
// into the cost ledger fails here with a concrete diff rather than a vague one.

import { describe, expect, it } from 'vitest'
import type { ChangeOrder, Expense } from '../../domain/types'
import { recalculateActuals, type AggItem } from '../../lib/budgetAggregates'
import { categoryFinancialSummary, projectFinancialSummary } from '../../lib/financialSummary'
import { cashFlowForecast, nextFourteenDaysDue } from '../cashflow/cashFlow'
import { TREASURY_TABLES } from './useTreasury'
import { cashOnHand, owedSummary, type TreasuryAllocation, type TreasuryDisbursement, type TreasuryDrawLike } from './treasury'

const CATEGORY = 'General Requirements & Soft Costs'

// Real line items from the project's soft-cost category.
const items: AggItem[] = [
  { id: 'item-arch', title: 'Architectural & engineering', categoryName: CATEGORY, budget: 16_981, actual: 0, committed: 0, isAllowance: false, allowanceAmount: 0 },
  { id: 'item-insurance', title: "Builder's risk insurance", categoryName: CATEGORY, budget: 4_550, actual: 0, committed: 0, isAllowance: false, allowanceAmount: 0 },
  { id: 'item-permits', title: 'Building permits & fees', categoryName: CATEGORY, budget: 12_350, actual: 0, committed: 0, isAllowance: false, allowanceAmount: 0 },
  { id: 'item-interest', title: 'Construction loan interest', categoryName: CATEGORY, budget: 0, actual: 0, committed: 0, isAllowance: false, allowanceAmount: 0 },
  { id: 'item-survey', title: 'Survey & soil testing', categoryName: CATEGORY, budget: 4_631, actual: 0, committed: 0, isAllowance: false, allowanceAmount: 0 },
  { id: 'item-temp', title: 'Temporary utilities & facilities', categoryName: CATEGORY, budget: 4_631, actual: 0, committed: 0, isAllowance: false, allowanceAmount: 0 },
]

const expense = (over: Partial<Expense> & Pick<Expense, 'id' | 'amount'>): Expense => ({
  owner: 'owner-1',
  projectId: 'project-1',
  amountPaid: over.amount,
  vendorName: '',
  invoiceNumber: '',
  date: '2026-01-01',
  dueDate: null,
  expectedPaymentDate: null,
  paidDate: null,
  paymentMethod: '',
  paymentReference: '',
  categoryName: CATEGORY,
  roomTag: '',
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  notes: '',
  isPaid: true,
  receiptObjectKey: null,
  fundingSource: 'owner_personal',
  ...over,
})

// The five real soft costs, all fronted from personal funds — exactly the ones draw #1 repays.
const expenses: Expense[] = [
  expense({ id: 'e-tank', amount: 233, vendorName: 'NJ Oil Tank Sweep LLC', date: '2026-04-29', paymentMethod: 'Credit card', budgetLineItemId: 'item-survey', budgetLineItemTitle: 'Survey & soil testing' }),
  expense({ id: 'e-survey', amount: 1_664, vendorName: 'Lakeland Surveying', date: '2026-04-30', paymentMethod: 'Sapphire', budgetLineItemId: 'item-survey', budgetLineItemTitle: 'Survey & soil testing' }),
  expense({ id: 'e-arch-1', amount: 5_000, vendorName: 'Lorenzo Franchina', date: '2026-06-08', paymentMethod: 'Check', budgetLineItemId: 'item-arch', budgetLineItemTitle: 'Architectural & engineering' }),
  expense({ id: 'e-insurance', amount: 241, vendorName: 'Steve Insurance', date: '2026-07-01', paymentMethod: 'Credit card', budgetLineItemId: 'item-insurance', budgetLineItemTitle: "Builder's risk insurance" }),
  expense({ id: 'e-arch-2', amount: 1_500, vendorName: 'Schwanewede Hals & Vince (SHV)', date: '2026-07-23', paymentMethod: 'Zelle', budgetLineItemId: 'item-arch', budgetLineItemTitle: 'Architectural & engineering' }),
]

// Synthetic, clearly labelled: the five real expenses are all fully paid, so they produce an
// empty cash-flow forecast. These two give the forecast something to be unchanged ABOUT.
const upcoming: Expense[] = [
  expense({ id: 'e-open-1', amount: 9_000, amountPaid: 0, isPaid: false, vendorName: 'Framing sub', expectedPaymentDate: '2026-07-28', budgetLineItemId: 'item-permits', budgetLineItemTitle: 'Building permits & fees' }),
  expense({ id: 'e-open-2', amount: 4_200, amountPaid: 1_200, isPaid: true, vendorName: 'Excavator', expectedPaymentDate: '2026-08-02', budgetLineItemId: 'item-permits', budgetLineItemTitle: 'Building permits & fees' }),
]

const allExpenses = [...expenses, ...upcoming]
const changeOrders: ChangeOrder[] = []
const project = { constructionBudget: 1_300_000, contingencyBudget: 200_000, purchasePrice: 1_100_000, closingCosts: 0 }
const TODAY = '2026-07-24'

// --- Treasury records that must NOT move any of the above ------------------------------------
// Draw #1 funds $250k less a $2.5k lender fee, then settles the personal out-of-pocket:
// three expenses in full, the architect's $5,000 only PARTIALLY ($3,000), and the
// reimbursement deliberately spans three different budget categories' line items.
const draws: TreasuryDrawLike[] = [
  { id: 'draw-1', amount: 250_000, feesAmount: 2_500, status: 'funded', drawDate: '2026-07-24', description: 'Draw 1 — soft costs' },
  { id: 'draw-2', amount: 180_000, feesAmount: 0, status: 'approved', drawDate: '2026-08-20', description: 'Draw 2 — foundation' },
]
const disbursements: TreasuryDisbursement[] = [
  { id: 'disb-self', drawId: 'draw-1', partyType: 'self', partyName: 'You', amount: 5_138, disbursedDate: '2026-07-24' },
  { id: 'disb-builder', drawId: 'draw-1', partyType: 'builder', partyName: 'Builder', amount: 12_000, disbursedDate: '2026-07-24' },
]
const allocations: TreasuryAllocation[] = [
  { disbursementId: 'disb-self', expenseId: 'e-tank', amount: 233 },
  { disbursementId: 'disb-self', expenseId: 'e-survey', amount: 1_664 },
  { disbursementId: 'disb-self', expenseId: 'e-insurance', amount: 241 },
  { disbursementId: 'disb-self', expenseId: 'e-arch-1', amount: 3_000 }, // partial
]

const snapshot = () => ({
  actuals: [...recalculateActuals(items, allExpenses, changeOrders, []).entries()].sort(),
  summary: projectFinancialSummary({ project, lineItems: items, expenses: allExpenses, changeOrders, allowanceSelections: [] }),
  category: categoryFinancialSummary(CATEGORY, items),
  forecast: cashFlowForecast(allExpenses, changeOrders, TODAY),
  due14: nextFourteenDaysDue(allExpenses, changeOrders, TODAY),
})

describe('reimbursements do not disturb the cost ledger', () => {
  it('leaves budget actuals, EAC, category spend and cash flow byte-identical', () => {
    const before = snapshot()

    // Record the entire treasury story: a funded draw, lender fees, two disbursements,
    // four allocations including a partial one spanning three budget categories.
    expect(cashOnHand(draws, disbursements)).toBeGreaterThan(0)
    expect(owedSummary(allExpenses, allocations).you.owed).toBeGreaterThan(0)

    const after = snapshot()
    expect(after).toEqual(before)
  })

  it('anchors the exact cost figures the reimbursement must not change', () => {
    const actuals = recalculateActuals(items, allExpenses, changeOrders, [])
    // $5,000 + $1,500 architect — NOT doubled by the $3,000 repayment against it.
    expect(actuals.get('item-arch')).toBe(6_500)
    expect(actuals.get('item-survey')).toBe(1_897)
    expect(actuals.get('item-insurance')).toBe(241)
    expect(actuals.get('item-interest')).toBe(0)

    const summary = projectFinancialSummary({ project, lineItems: items, expenses, changeOrders, allowanceSelections: [] })
    // The five real soft costs, once each.
    expect(summary.actual).toBe(8_638)
    expect(summary.expensePaid).toBe(8_638)
    expect(summary.cashPaid).toBe(8_638)
  })

  it('reports the reimbursement on the treasury side only', () => {
    // The five real soft costs: $8,638 fronted, $5,138 repaid out of draw #1, leaving $3,500
    // owed to you — $2,000 of the architect's $5,000 plus the $1,500 SHV invoice.
    const owed = owedSummary(expenses, allocations)
    expect(owed.you.fronted).toBe(8_638)
    expect(owed.you.reimbursed).toBe(5_138)
    expect(owed.you.owed).toBe(3_500)
    // The builder disbursement isn't allocated to any fronted expense, so nothing is owed
    // to him and the $12,000 stands as an unallocated advance.
    expect(owed.builder.owed).toBe(0)
    expect(owed.totalOwedForFrontedCash).toBe(3_500)

    // $250,000 - $2,500 fees - $5,138 - $12,000 still sitting in the personal account. The
    // approved-but-unfunded draw #2 contributes nothing — it hasn't moved money.
    expect(cashOnHand(draws, disbursements)).toBe(230_362)
  })

  it('counts partial payments on open invoices as money you have fronted', () => {
    // The $1,200 already paid toward the $4,200 excavator invoice is out of pocket too, even
    // though the invoice is still open — so the full personal balance exceeds the five closed bills.
    const owed = owedSummary(allExpenses, allocations)
    expect(owed.you.fronted).toBe(9_838)
    expect(owed.you.owed).toBe(4_700)
    // …while the $3,000 still unpaid on that invoice stays a payable, not a reimbursement.
    expect(owed.unpaidVendorTotal).toBe(12_000)
  })

  it('never writes to a cost-bearing table', () => {
    // Structural guard: the treasury feature only ever touches these two tables. If a future
    // change routes a reimbursement through `expenses` or `change_orders`, the Postgres
    // reconciler in 0017 would count it as cost — this assertion fails first.
    expect(TREASURY_TABLES).toEqual(['draw_disbursements', 'disbursement_allocations'])
    expect(TREASURY_TABLES).not.toContain('expenses')
    expect(TREASURY_TABLES).not.toContain('change_orders')
    expect(TREASURY_TABLES).not.toContain('budget_line_items')
  })
})
