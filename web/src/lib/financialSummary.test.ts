import { describe, expect, it } from 'vitest'
import type { AggChangeOrder, AggItem } from './budgetAggregates'
import {
  categoryFinancialSummary,
  projectFinancialSummary,
  type FinancialExpense,
} from './financialSummary'

const item = (over: Partial<AggItem> & { id: string; title: string; categoryName: string }): AggItem => ({
  budget: 0,
  actual: 0,
  committed: 0,
  isAllowance: false,
  allowanceAmount: 0,
  ...over,
})

const expense = (over: Partial<FinancialExpense> & { amount: number }): FinancialExpense => ({
  amountPaid: 0,
  isPaid: false,
  retainageAmount: 0,
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  categoryName: '',
  changeOrderId: null,
  ...over,
})

const changeOrder = (
  over: Partial<AggChangeOrder> & { id: string; amount: number; status: AggChangeOrder['status'] },
): AggChangeOrder => ({
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  categoryName: '',
  ...over,
})

const framing = item({
  id: 'framing',
  title: 'Framing',
  categoryName: 'Interior',
  budget: 4_000,
  actual: 1_000,
  committed: 2_500,
})
const electrical = item({
  id: 'electrical',
  title: 'Electrical',
  categoryName: 'Systems',
  budget: 3_000,
  actual: 0,
  committed: 1_000,
})
const tileAllowance = item({
  id: 'tile',
  title: 'Tile',
  categoryName: 'Interior',
  budget: 2_000,
  actual: 1_700,
  committed: 500,
  isAllowance: true,
  allowanceAmount: 1_500,
})

const linkedChangeInvoice = expense({
  amount: 1_000,
  amountPaid: 400,
  isPaid: true,
  retainageAmount: 100,
  budgetLineItemId: framing.id,
  budgetLineItemTitle: framing.title,
  categoryName: framing.categoryName,
  changeOrderId: 'linked-paid',
})
const allowanceInvoice = expense({
  amount: 1_200,
  budgetLineItemId: tileAllowance.id,
  budgetLineItemTitle: tileAllowance.title,
  categoryName: tileAllowance.categoryName,
})
const unassignedExpense = expense({
  amount: 300,
  amountPaid: 300,
  isPaid: true,
})

const linkedPaidOrder = changeOrder({
  id: 'linked-paid',
  amount: 1_000,
  status: 'paid',
  budgetLineItemId: framing.id,
  budgetLineItemTitle: framing.title,
  categoryName: framing.categoryName,
})
const approvedOrder = changeOrder({ id: 'approved', amount: 500, status: 'approved' })
const pendingOrder = changeOrder({ id: 'pending', amount: 200, status: 'pending' })

describe('projectFinancialSummary', () => {
  it('characterizes incurred, paid, committed, and pending values without double-counting', () => {
    const summary = projectFinancialSummary({
      project: {
        constructionBudget: 10_000,
        contingencyBudget: 1_000,
        purchasePrice: 50_000,
        closingCosts: 2_000,
      },
      lineItems: [framing, electrical, tileAllowance],
      expenses: [linkedChangeInvoice, allowanceInvoice, unassignedExpense],
      changeOrders: [linkedPaidOrder, approvedOrder, pendingOrder],
      allowanceSelections: [{ lineItemId: tileAllowance.id, amount: 1_700 }],
    })

    expect(summary).toMatchObject({
      baseBudget: 10_000,
      contingencyBudget: 1_000,
      constructionLimit: 11_000,
      lineItemBudget: 9_000,
      unallocatedBudget: 1_000,
      landAcquisition: 52_000,
      allInBudget: 63_000,

      // 1,000 linked CO invoice + 300 unassigned expense + 1,700 allowance
      // selection. The 1,200 allowance invoice and linked paid CO are substituted/de-duped.
      actual: 3_000,
      // 1,500 framing + 1,000 electrical open commitments + 500 approved CO.
      committed: 3_000,
      pending: 200,
      exposure: 6_000,
      projected: 6_200,
      remaining: 4_800,
      usedPct: 56,

      estimateToComplete: 4_000,
      estimatedFinalCost: 10_200,
      estimatedVariance: 200,
      contingencyUsed: 0,
      contingencyRemaining: 1_000,

      expenseInvoiced: 2_500,
      expensePaid: 700,
      cashPaid: 700,
      invoiceBalance: 1_800,
      payableNow: 1_700,
      retainage: 100,
    })
    expect(summary.utilization).toBeCloseTo(6_200 / 11_000, 10)
  })

  it('burns contingency only after actual plus committed exposure exceeds base scope', () => {
    const summary = projectFinancialSummary({
      project: { constructionBudget: 1_000, contingencyBudget: 200 },
      lineItems: [
        item({
          id: 'over',
          title: 'Over',
          categoryName: 'Risk',
          budget: 1_000,
          actual: 1_050,
          committed: 1_100,
        }),
      ],
      expenses: [expense({ amount: 1_050, budgetLineItemId: 'over' })],
      changeOrders: [],
      allowanceSelections: [],
    })

    expect(summary.exposure).toBe(1_100)
    expect(summary.contingencyUsed).toBe(100)
    expect(summary.contingencyRemaining).toBe(100)
    expect(summary.contingencyUsedPct).toBe(50)
    expect(summary.estimatedFinalCost).toBe(1_100)
    expect(summary.estimatedVariance).toBe(100)
  })
})

describe('categoryFinancialSummary', () => {
  it('uses allowance limits, stored actuals, and open commitments consistently', () => {
    const summary = categoryFinancialSummary('Interior', [framing, electrical, tileAllowance])

    expect(summary).toMatchObject({
      categoryName: 'Interior',
      itemCount: 2,
      allowanceItemCount: 1,
      budget: 6_000,
      effectiveBudget: 5_500,
      actual: 2_700,
      openCommitment: 1_500,
      exposure: 4_200,
      remaining: 1_300,
      variance: -1_300,
      status: 'healthy',
      overBudgetItemCount: 1,
      nearLimitItemCount: 0,
    })
    expect(summary.utilization).toBeCloseTo(4_200 / 5_500, 10)
  })

  it('bases category status on cent-exact aggregate exposure thresholds', () => {
    const near = categoryFinancialSummary('Near', [
      item({
        id: 'near',
        title: 'Near',
        categoryName: 'Near',
        budget: 100,
        actual: 80,
        committed: 90,
      }),
    ])
    const over = categoryFinancialSummary('Over', [
      item({
        id: 'over',
        title: 'Over',
        categoryName: 'Over',
        budget: 100,
        actual: 90,
        committed: 100.01,
      }),
    ])

    expect(near).toMatchObject({
      openCommitment: 10,
      exposure: 90,
      remaining: 10,
      variance: -10,
      utilization: 0.9,
      status: 'nearLimit',
    })
    expect(over).toMatchObject({
      openCommitment: 10.01,
      exposure: 100.01,
      remaining: -0.01,
      variance: 0.01,
      status: 'overBudget',
    })
  })

  it('returns a stable empty summary for a missing category', () => {
    expect(categoryFinancialSummary('Missing', [framing])).toEqual({
      categoryName: 'Missing',
      itemCount: 0,
      allowanceItemCount: 0,
      budget: 0,
      effectiveBudget: 0,
      actual: 0,
      openCommitment: 0,
      exposure: 0,
      remaining: 0,
      variance: 0,
      utilization: 0,
      status: 'healthy',
      overBudgetItemCount: 0,
      nearLimitItemCount: 0,
    })
  })
})
