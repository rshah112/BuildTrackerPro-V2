import { describe, expect, it } from 'vitest'
import {
  cashOnHand,
  disbursementSummary,
  drawNetFunded,
  expenseSettlement,
  interestFundingDefault,
  owedSummary,
  undisbursedFromDraw,
  type TreasuryAllocation,
  type TreasuryDisbursement,
  type TreasuryDrawLike,
  type TreasuryExpense,
} from './treasury'

const exp = (over: Partial<TreasuryExpense> & Pick<TreasuryExpense, 'id' | 'amount'>): TreasuryExpense => ({
  amountPaid: over.amount,
  isPaid: true,
  vendorName: 'Vendor',
  categoryName: 'Soft costs',
  date: '2026-07-01',
  fundingSource: 'owner_personal',
  ...over,
})

describe('draw cash', () => {
  it('nets lender fees out of the cash a draw delivers', () => {
    expect(drawNetFunded({ id: 'd', amount: 250_000, feesAmount: 2_500, status: 'funded', drawDate: '2026-07-24' })).toBe(247_500)
  })

  it('delivers nothing until the draw is actually funded', () => {
    const requested: TreasuryDrawLike = { id: 'd', amount: 100_000, status: 'requested', drawDate: '2026-08-01' }
    const approved: TreasuryDrawLike = { id: 'd', amount: 100_000, status: 'approved', drawDate: '2026-08-01' }
    expect(drawNetFunded(requested)).toBe(0)
    expect(drawNetFunded(approved)).toBe(0)
  })

  it('treats a legacy draw with no status as funded', () => {
    expect(drawNetFunded({ id: 'd', amount: 50_000, drawDate: '2026-05-01' })).toBe(50_000)
  })

  it('tracks undisbursed cash still sitting in the account', () => {
    const draw: TreasuryDrawLike = { id: 'd1', amount: 250_000, feesAmount: 2_500, status: 'funded', drawDate: '2026-07-24' }
    const disb: TreasuryDisbursement[] = [
      { id: 'x', drawId: 'd1', partyType: 'self', partyName: 'You', amount: 5_138, disbursedDate: '2026-07-24' },
      { id: 'y', drawId: 'd2', partyType: 'builder', partyName: 'Builder', amount: 900, disbursedDate: '2026-07-24' },
    ]
    // The d2 disbursement must not reduce d1's cash.
    expect(undisbursedFromDraw(draw, disb)).toBe(242_362)
    expect(cashOnHand([draw], disb)).toBe(242_362)
  })

  it('never reports negative cash on hand', () => {
    const draw: TreasuryDrawLike = { id: 'd1', amount: 1_000, status: 'funded', drawDate: '2026-07-24' }
    const disb: TreasuryDisbursement[] = [{ id: 'x', drawId: 'd1', partyType: 'self', partyName: 'You', amount: 5_000, disbursedDate: '2026-07-24' }]
    expect(undisbursedFromDraw(draw, disb)).toBe(0)
  })
})

describe('expense settlement', () => {
  const alloc = (amount: number): TreasuryAllocation[] => [{ disbursementId: 'd', expenseId: 'e1', amount }]

  it('marks a fully repaid expense reimbursed without touching its cost', () => {
    const s = expenseSettlement(exp({ id: 'e1', amount: 6_500 }), alloc(6_500))
    expect(s).toMatchObject({ reimbursable: 6_500, reimbursed: 6_500, outstanding: 0, state: 'reimbursed' })
  })

  it('handles partial reimbursement', () => {
    const s = expenseSettlement(exp({ id: 'e1', amount: 6_500 }), alloc(2_500))
    expect(s).toMatchObject({ reimbursed: 2_500, outstanding: 4_000, state: 'partial' })
  })

  it('reports unreimbursed when nothing has come back', () => {
    expect(expenseSettlement(exp({ id: 'e1', amount: 233 }), []).state).toBe('unreimbursed')
  })

  it('clamps reimbursement to the cash actually laid out', () => {
    // Over-allocated (the DB guard rejects this too) — the math must not report negative owed.
    const s = expenseSettlement(exp({ id: 'e1', amount: 1_000 }), alloc(4_000))
    expect(s.reimbursed).toBe(1_000)
    expect(s.outstanding).toBe(0)
  })

  it('owes nothing on an unpaid bill — nobody has fronted it yet', () => {
    const s = expenseSettlement(exp({ id: 'e1', amount: 9_000, amountPaid: 0, isPaid: false }), [])
    expect(s).toMatchObject({ reimbursable: 0, state: 'not_applicable' })
  })

  it('creates no obligation for draw-funded or lender-paid costs', () => {
    expect(expenseSettlement(exp({ id: 'e1', amount: 5_000, fundingSource: 'owner_draw' }), []).state).toBe('not_applicable')
    expect(expenseSettlement(exp({ id: 'e1', amount: 12_500, fundingSource: 'loan_direct' }), []).state).toBe('not_applicable')
  })

  it('reads the pre-0020 funding values', () => {
    expect(expenseSettlement(exp({ id: 'e1', amount: 100, fundingSource: 'personal' }), []).origin).toBe('owner_personal')
    expect(expenseSettlement(exp({ id: 'e1', amount: 100, fundingSource: 'loan' }), []).origin).toBe('owner_draw')
    expect(expenseSettlement(exp({ id: 'e1', amount: 100, fundingSource: '' }), []).origin).toBe('owner_personal')
  })
})

describe('who is owed what', () => {
  const expenses: TreasuryExpense[] = [
    exp({ id: 'e1', amount: 6_500, fundingSource: 'owner_personal' }),
    exp({ id: 'e2', amount: 2_138, fundingSource: 'owner_personal' }),
    exp({ id: 'e3', amount: 18_400, fundingSource: 'builder' }),
    exp({ id: 'e4', amount: 40_000, fundingSource: 'owner_draw' }),
    exp({ id: 'e5', amount: 9_000, amountPaid: 0, isPaid: false, vendorName: 'Framing sub' }),
  ]

  it('separates your balance, the builder’s, and unpaid subs', () => {
    const owed = owedSummary(expenses, [{ disbursementId: 'd', expenseId: 'e1', amount: 4_000 }])
    expect(owed.you.fronted).toBe(8_638)
    expect(owed.you.reimbursed).toBe(4_000)
    expect(owed.you.owed).toBe(4_638)
    expect(owed.builder.owed).toBe(18_400)
    expect(owed.totalOwedForFrontedCash).toBe(23_038)
    // Draw-funded spend creates no obligation to anyone.
    expect(owed.you.fronted + owed.builder.fronted).toBe(27_038)
    // An unpaid invoice is a payable, not a reimbursement — kept separate on purpose.
    expect(owed.unpaidVendorTotal).toBe(9_000)
    expect(owed.unpaidVendors[0]).toMatchObject({ label: 'Framing sub', owed: 9_000 })
  })

  it('counts only expenses that still have an outstanding balance', () => {
    const owed = owedSummary(expenses, [{ disbursementId: 'd', expenseId: 'e1', amount: 6_500 }])
    expect(owed.you.owed).toBe(2_138)
    expect(owed.you.expenseCount).toBe(1)
  })
})

describe('disbursement allocation', () => {
  it('reports unallocated cash as float, not an error', () => {
    const d: TreasuryDisbursement = { id: 'd1', drawId: 'x', partyType: 'builder', partyName: 'Builder', amount: 12_000, disbursedDate: '2026-07-24' }
    const s = disbursementSummary(d, [{ disbursementId: 'd1', expenseId: 'e1', amount: 4_500 }])
    expect(s).toMatchObject({ allocated: 4_500, unallocated: 7_500 })
  })

  it('ignores allocations belonging to other disbursements', () => {
    const d: TreasuryDisbursement = { id: 'd1', drawId: 'x', partyType: 'self', partyName: 'You', amount: 1_000, disbursedDate: '2026-07-24' }
    expect(disbursementSummary(d, [{ disbursementId: 'other', expenseId: 'e1', amount: 900 }]).unallocated).toBe(1_000)
  })
})

describe('interest funding default', () => {
  const funded: TreasuryDrawLike[] = [{ id: 'd1', amount: 250_000, feesAmount: 2_500, status: 'funded', drawDate: '2026-07-24' }]

  it('pays interest from leftover draw cash when there is enough', () => {
    expect(interestFundingDefault(7_500, funded, [])).toBe('owner_draw')
  })

  it('falls back to personal funds when draw cash is short', () => {
    const drained: TreasuryDisbursement[] = [{ id: 'x', drawId: 'd1', partyType: 'self', partyName: 'You', amount: 247_500, disbursedDate: '2026-07-24' }]
    expect(interestFundingDefault(7_500, funded, drained)).toBe('owner_personal')
  })
})
