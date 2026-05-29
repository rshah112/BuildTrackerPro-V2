import { describe, expect, it } from 'vitest'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense } from '../../domain/types'
import { actualPatchesForExpenses, upsertExpense } from './recalculateLineItemActuals'

const item = (over: Partial<BudgetLineItem> & { id: string; title: string }): BudgetLineItem => ({
  owner: 'u1',
  projectId: 'p1',
  costCode: '',
  categoryName: 'Structure',
  roomTag: '',
  budget: 0,
  actual: 0,
  committed: 0,
  notes: '',
  isPinned: false,
  isAllowance: false,
  allowanceAmount: 0,
  createdAt: '2026-05-29T00:00:00.000Z',
  ...over,
})

const expense = (over: Partial<Expense> = {}): Expense => ({
  id: 'e1',
  owner: 'u1',
  projectId: 'p1',
  amount: 0,
  amountPaid: 0,
  vendorName: '',
  invoiceNumber: '',
  date: '2026-05-29T00:00:00.000Z',
  dueDate: null,
  expectedPaymentDate: null,
  paidDate: null,
  paymentMethod: '',
  paymentReference: '',
  categoryName: '',
  roomTag: '',
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  notes: '',
  isPaid: true,
  receiptObjectKey: null,
  ...over,
})

describe('actualPatchesForExpenses', () => {
  it('returns only changed actual values after expense recalculation', () => {
    const lineItems = [
      item({ id: 'a', title: 'Framing', actual: 100 }),
      item({ id: 'b', title: 'Tile', actual: 0 }),
    ]
    const patches = actualPatchesForExpenses({
      lineItems,
      expenses: [expense({ amount: 125.25, budgetLineItemId: 'a' })],
      changeOrders: [],
      allowanceSelections: [],
    })

    expect(patches).toEqual([{ id: 'a', actual: 125.25 }])
  })

  it('includes paid change orders and allowance selections', () => {
    const lineItems = [
      item({ id: 'a', title: 'Framing', actual: 0 }),
      item({ id: 'b', title: 'Tile', actual: 0, isAllowance: true, allowanceAmount: 500 }),
    ]
    const changeOrders: ChangeOrder[] = [
      {
        id: 'co1',
        owner: 'u1',
        projectId: 'p1',
        title: 'Extra framing',
        amount: 75,
        status: 'paid',
        notes: '',
        categoryName: '',
        budgetLineItemId: 'a',
        budgetLineItemTitle: '',
        createdAt: '2026-05-29T00:00:00.000Z',
        expectedPaymentDate: null,
      },
    ]
    const allowanceSelections: AllowanceSelection[] = [
      {
        id: 'sel1',
        owner: 'u1',
        projectId: 'p1',
        lineItemId: 'b',
        selectionDate: '2026-05-29T00:00:00.000Z',
        vendor: '',
        amount: 625,
        notes: '',
        photoObjectKey: null,
      },
    ]

    const patches = actualPatchesForExpenses({
      lineItems,
      expenses: [expense({ amount: 125, budgetLineItemId: 'a' })],
      changeOrders,
      allowanceSelections,
    })

    expect(patches).toEqual([
      { id: 'a', actual: 200 },
      { id: 'b', actual: 625 },
    ])
  })
})

describe('upsertExpense', () => {
  it('replaces an existing row or appends a new row', () => {
    expect(upsertExpense([expense({ id: 'e1', amount: 10 })], expense({ id: 'e1', amount: 20 }))).toEqual([
      expense({ id: 'e1', amount: 20 }),
    ])
    expect(upsertExpense([], expense({ id: 'e2' }))).toEqual([expense({ id: 'e2' })])
  })
})
