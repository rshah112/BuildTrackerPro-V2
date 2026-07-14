import { describe, expect, it } from 'vitest'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense, Vendor } from '../../domain/types'
import {
  allowanceOperationGroups,
  allowanceOperationSummary,
  changeOrderOperationSummary,
  vendorOperationRows,
  vendorOperationSummary,
} from './operationsSummary'

const vendor = (id: string, name: string): Vendor => ({
  id,
  owner: 'owner',
  projectId: 'project',
  name,
  trade: '',
  phone: '',
  email: '',
  notes: '',
  taxId: '',
  licenseNumber: '',
  insuranceExpiry: null,
})

const expense = (over: Partial<Expense>): Expense => ({
  id: 'expense',
  owner: 'owner',
  projectId: 'project',
  amount: 0,
  amountPaid: 0,
  vendorName: '',
  vendorId: null,
  invoiceNumber: '',
  date: '2026-01-01',
  dueDate: null,
  expectedPaymentDate: null,
  paidDate: null,
  paymentMethod: '',
  paymentReference: '',
  categoryName: '',
  roomTag: '',
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  changeOrderId: null,
  notes: '',
  isPaid: false,
  receiptObjectKey: null,
  ...over,
})

const allowance = (id: string, amount: number): BudgetLineItem => ({
  id,
  owner: 'owner',
  projectId: 'project',
  costCode: '',
  title: id,
  categoryName: 'Finishes',
  roomTag: '',
  budget: amount,
  actual: 0,
  committed: 0,
  notes: '',
  isPinned: false,
  isAllowance: true,
  allowanceAmount: amount,
  createdAt: '2026-01-01',
})

const selection = (id: string, lineItemId: string, amount: number): AllowanceSelection => ({
  id,
  owner: 'owner',
  projectId: 'project',
  lineItemId,
  selectionDate: '2026-01-01',
  vendor: '',
  amount,
  notes: '',
  photoObjectKey: null,
})

describe('vendor operation summaries', () => {
  it('counts each linked expense once even when duplicate vendor profiles share a name', () => {
    const vendors = [vendor('one', 'Acme'), vendor('two', 'ACME')]
    const expenses = [expense({ amount: 100, amountPaid: 40, vendorName: 'Acme', isPaid: true })]
    const rows = vendorOperationRows(vendors, expenses, [], [])

    expect(vendorOperationSummary(rows)).toMatchObject({
      vendorCount: 2,
      invoiced: 100,
      paid: 40,
      open: 60,
    })
  })

  it('prefers a stable vendor ID and only falls back to legacy names', () => {
    const vendors = [vendor('one', 'Renamed Co'), vendor('two', 'Old Name')]
    const expenses = [
      expense({ id: 'renamed', amount: 100, vendorId: 'one', vendorName: 'Old Name' }),
      expense({ id: 'legacy', amount: 50, vendorId: null, vendorName: 'Renamed Co' }),
    ]
    const rows = vendorOperationRows(vendors, expenses, [], [])

    expect(rows.find((row) => row.vendor.id === 'one')?.rollup.invoiced).toBe(150)
    expect(rows.find((row) => row.vendor.id === 'two')?.rollup.invoiced).toBe(0)
    expect(vendorOperationSummary(rows).invoiced).toBe(150)
  })
})

describe('change-order operation summaries', () => {
  it('keeps status amounts and unassigned counts explicit', () => {
    const orders = [
      { id: 'p', amount: 200, status: 'pending', budgetLineItemId: null, budgetLineItemTitle: '' },
      { id: 'a', amount: 300, status: 'approved', budgetLineItemId: 'line', budgetLineItemTitle: 'Line' },
      { id: 'd', amount: 100, status: 'paid', budgetLineItemId: 'line', budgetLineItemTitle: 'Line' },
    ] as ChangeOrder[]

    expect(changeOrderOperationSummary(orders)).toMatchObject({
      total: { count: 3, amount: 600 },
      pending: { count: 1, amount: 200 },
      approved: { count: 1, amount: 300 },
      paid: { count: 1, amount: 100 },
      unassignedCount: 1,
    })
  })
})

describe('allowance operation summaries', () => {
  it('uses selections ahead of linked expenses and preserves unlinked selections', () => {
    const lines = [allowance('tile', 1_000), allowance('lighting', 500)]
    const selections = [selection('tile-selection', 'tile', 1_200), selection('orphan', 'removed', 90)]
    const expenses = [expense({ amount: 800, budgetLineItemId: 'tile' })]
    const groups = allowanceOperationGroups(lines, selections, expenses)

    expect(groups.find((group) => group.id === 'tile')).toMatchObject({
      used: 1_200,
      remaining: -200,
      source: 'selections',
    })
    expect(groups.find((group) => group.id === 'unlinked-removed')).toMatchObject({
      used: 90,
      remaining: null,
      source: 'unlinked',
    })
    expect(allowanceOperationSummary(groups)).toMatchObject({
      itemCount: 2,
      allowance: 1_500,
      used: 1_200,
      available: 500,
      overage: 200,
      unselectedCount: 1,
      unlinkedSelectionCount: 1,
    })
  })

  it('distinguishes a zero-dollar selection from no selection and preserves reclassified lines', () => {
    const formerAllowance = { ...allowance('former', 250), isAllowance: false }
    const groups = allowanceOperationGroups(
      [allowance('lighting', 500), formerAllowance],
      [selection('zero', 'lighting', 0), selection('former-selection', 'former', 120)],
      [],
    )

    expect(groups.find((group) => group.id === 'lighting')).toMatchObject({
      source: 'selections',
      used: 0,
      remaining: 500,
    })
    expect(groups.find((group) => group.id === 'reclassified-former')).toMatchObject({
      lineItem: { id: 'former', title: 'former' },
      source: 'reclassified',
      allowance: null,
      remaining: null,
    })
    expect(allowanceOperationSummary(groups)).toMatchObject({
      unselectedCount: 0,
      reclassifiedSelectionCount: 1,
      unlinkedSelectionCount: 0,
    })
  })
})
