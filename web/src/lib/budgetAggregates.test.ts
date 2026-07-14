import { describe, it, expect } from 'vitest'
import {
  recalculateActuals,
  actualSpend,
  committedSpend,
  cashPaidTotal,
  pendingExposure,
  allowanceOverage,
  type AggItem,
  type AggExpense,
  type AggChangeOrder,
} from './budgetAggregates'

const item = (over: Partial<AggItem> & { id: string }): AggItem => ({
  title: '',
  categoryName: '',
  budget: 0,
  actual: 0,
  committed: 0,
  isAllowance: false,
  allowanceAmount: 0,
  ...over,
})
const exp = (over: Partial<AggExpense> = {}): AggExpense => ({
  amount: 0,
  amountPaid: 0,
  isPaid: true,
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  categoryName: '',
  changeOrderId: null,
  ...over,
})
const co = (over: Partial<AggChangeOrder> = {}): AggChangeOrder => ({
  id: 'co',
  amount: 0,
  status: 'pending',
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  categoryName: '',
  ...over,
})

describe('recalculateActuals', () => {
  it('sums expenses + paid COs per item; allowance items use selections when present', () => {
    const items = [
      item({ id: 'a', title: 'Framing' }),
      item({ id: 'b', title: 'Tile', isAllowance: true, allowanceAmount: 500 }),
    ]
    const result = recalculateActuals(
      items,
      [exp({ amount: 300, budgetLineItemId: 'a' })],
      [co({ amount: 100, status: 'paid', budgetLineItemId: 'a' })],
      [{ lineItemId: 'b', amount: 600 }],
    )
    expect(result.get('a')).toBe(400)
    expect(result.get('b')).toBe(600)
  })

  it('resolves by title+category when no id', () => {
    const items = [item({ id: 'a', title: 'Framing', categoryName: 'Structure' })]
    const result = recalculateActuals(
      items,
      [exp({ amount: 250, budgetLineItemTitle: 'framing', categoryName: 'structure' })],
      [],
      [],
    )
    expect(result.get('a')).toBe(250)
  })

  it('resolves ambiguous legacy title links to the lowest id regardless of input order', () => {
    const items = [
      item({ id: 'b', title: 'Framing', categoryName: 'Structure' }),
      item({ id: 'a', title: 'Framing', categoryName: 'Structure' }),
    ]
    const result = recalculateActuals(
      items,
      [exp({ amount: 250, budgetLineItemTitle: 'framing', categoryName: 'structure' })],
      [],
      [],
    )
    expect(result.get('a')).toBe(250)
    expect(result.get('b')).toBe(0)
  })

  it('does not add a paid change order again when an expense represents it', () => {
    const items = [item({ id: 'a', title: 'Framing' })]
    const result = recalculateActuals(
      items,
      [exp({ amount: 300, budgetLineItemId: 'a', changeOrderId: 'co1' })],
      [{ ...co({ amount: 300, status: 'paid', budgetLineItemId: 'a' }), id: 'co1' }],
      [],
    )
    expect(result.get('a')).toBe(300)
  })
})

describe('actualSpend de-dups allowance expenses against selections', () => {
  it('excludes expenses on allowance items that have selections', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', isAllowance: true, allowanceAmount: 500 }),
    ]
    const total = actualSpend(
      items,
      [exp({ amount: 300, budgetLineItemId: 'a' }), exp({ amount: 50, budgetLineItemId: 'b' })],
      [{ lineItemId: 'b', amount: 600 }],
      [co({ amount: 100, status: 'paid' }), co({ amount: 30, status: 'pending' })],
    )
    // 300 (a) + 600 (allowance selection) + 100 (paid CO); the 50 expense on b is dropped
    expect(total).toBe(1000)
  })

  it('also excludes a TITLE-linked allowance expense (no id) when the allowance has selections', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', title: 'Tile', categoryName: 'Finishes', isAllowance: true, allowanceAmount: 500 }),
    ]
    const total = actualSpend(
      items,
      [
        exp({ amount: 300, budgetLineItemId: 'a' }),
        // tied to the allowance by title+category only (budgetLineItemId stays null)
        exp({ amount: 400, budgetLineItemId: null, budgetLineItemTitle: 'Tile', categoryName: 'Finishes' }),
      ],
      [{ lineItemId: 'b', amount: 600 }],
      [],
    )
    // 300 (a) + 600 (selection); the 400 title-linked allowance expense is dropped — it was
    // double-counted before the fix.
    expect(total).toBe(900)
  })


  it('de-duplicates a linked change order from actual spend', () => {
    const items = [item({ id: 'a' })]
    expect(
      actualSpend(
        items,
        [exp({ amount: 500, budgetLineItemId: 'a', changeOrderId: 'co1' })],
        [],
        [{ ...co({ amount: 500, status: 'paid' }), id: 'co1' }],
      ),
    ).toBe(500)
  })
})

describe('committedSpend', () => {
  it('open commitments + approved COs', () => {
    const items = [item({ id: 'a', budget: 1000, actual: 100, committed: 400 })] // open = 300
    expect(committedSpend(items, [co({ amount: 200, status: 'approved' })])).toBe(500)
  })


  it('excludes approved change orders already represented by linked expenses', () => {
    expect(
      committedSpend(
        [],
        [{ ...co({ amount: 200, status: 'approved' }), id: 'co1' }],
        [exp({ amount: 200, changeOrderId: 'co1' })],
      ),
    ).toBe(0)
  })
})

describe('cashPaidTotal', () => {
  it('effective paid on expenses + paid COs', () => {
    expect(
      cashPaidTotal([exp({ amount: 100, amountPaid: 60, isPaid: true })], [co({ amount: 100, status: 'paid' })]),
    ).toBe(160)
  })


  it('does not count cash twice for a linked paid change order', () => {
    expect(
      cashPaidTotal(
        [exp({ amount: 100, amountPaid: 60, isPaid: true, changeOrderId: 'co1' })],
        [{ ...co({ amount: 100, status: 'paid' }), id: 'co1' }],
      ),
    ).toBe(60)
  })
})

describe('pendingExposure', () => {
  it('sums pending COs only', () => {
    expect(pendingExposure([co({ amount: 30, status: 'pending' }), co({ amount: 99, status: 'paid' })])).toBe(30)
  })


  it('excludes a pending order represented by a linked expense', () => {
    expect(
      pendingExposure(
        [{ ...co({ amount: 30, status: 'pending' }), id: 'co1' }],
        [exp({ amount: 30, changeOrderId: 'co1' })],
      ),
    ).toBe(0)
  })
})

describe('allowanceOverage', () => {
  it('selections over allowance, plus expense-based overage when no selections', () => {
    const items = [
      item({ id: 'b', isAllowance: true, allowanceAmount: 500 }),
      item({ id: 'c', isAllowance: true, allowanceAmount: 200 }),
    ]
    const overage = allowanceOverage(
      items,
      [{ lineItemId: 'b', amount: 600 }],
      [exp({ amount: 250, budgetLineItemId: 'c' })],
    )
    // b: 600-500=100 ; c: no selections -> expense 250-200=50 ; total 150
    expect(overage).toBe(150)
  })
})
