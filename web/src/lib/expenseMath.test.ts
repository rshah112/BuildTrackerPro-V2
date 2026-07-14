import { describe, it, expect } from 'vitest'
import {
  effectiveAmountPaid,
  balanceDue,
  expensePaymentState,
  payableBalance,
  retainageHeld,
} from './expenseMath'

describe('expense math', () => {
  it('unpaid expense pays 0 and owes full amount', () => {
    expect(effectiveAmountPaid({ amount: 100, amountPaid: 100, isPaid: false })).toBe(0)
    expect(balanceDue({ amount: 100, amountPaid: 100, isPaid: false })).toBe(100)
  })

  it('paid-in-full owes nothing', () => {
    expect(effectiveAmountPaid({ amount: 100, amountPaid: 100, isPaid: true })).toBe(100)
    expect(balanceDue({ amount: 100, amountPaid: 100, isPaid: true })).toBe(0)
  })

  it('overpayment is clamped to amount', () => {
    expect(effectiveAmountPaid({ amount: 100, amountPaid: 150, isPaid: true })).toBe(100)
    expect(balanceDue({ amount: 100, amountPaid: 150, isPaid: true })).toBe(0)
  })

  it('partial payment leaves a balance', () => {
    expect(effectiveAmountPaid({ amount: 100, amountPaid: 40, isPaid: true })).toBe(40)
    expect(balanceDue({ amount: 100, amountPaid: 40, isPaid: true })).toBe(60)
  })

  it('negative amountPaid floors at 0', () => {
    expect(effectiveAmountPaid({ amount: 100, amountPaid: -20, isPaid: true })).toBe(0)
  })

  it('separates the total balance from retainage payable later', () => {
    const expense = { amount: 1000, amountPaid: 400, isPaid: true, retainageAmount: 100 }
    expect(balanceDue(expense)).toBe(600)
    expect(retainageHeld(expense)).toBe(100)
    expect(payableBalance(expense)).toBe(500)
    expect(expensePaymentState(expense)).toBe('partial')
  })

  it('clamps retainage to the remaining balance and identifies retainage-only balances', () => {
    const expense = { amount: 1000, amountPaid: 900, isPaid: true, retainageAmount: 200 }
    expect(retainageHeld(expense)).toBe(100)
    expect(payableBalance(expense)).toBe(0)
    expect(expensePaymentState(expense)).toBe('retainage')
  })

  it('identifies fully paid, partially paid, and open expenses consistently', () => {
    expect(expensePaymentState({ amount: 100, amountPaid: 100, isPaid: true })).toBe('paid')
    expect(expensePaymentState({ amount: 100, amountPaid: 25, isPaid: true })).toBe('partial')
    expect(expensePaymentState({ amount: 100, amountPaid: 0, isPaid: false })).toBe('open')
  })
})
