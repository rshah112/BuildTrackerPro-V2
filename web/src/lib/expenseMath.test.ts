import { describe, it, expect } from 'vitest'
import { effectiveAmountPaid, balanceDue } from './expenseMath'

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
})
