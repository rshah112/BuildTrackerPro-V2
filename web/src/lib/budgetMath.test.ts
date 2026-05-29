import { describe, it, expect } from 'vitest'
import {
  openCommitment,
  spentAndCommitted,
  remaining,
  variance,
  utilization,
  lineItemHealth,
  type LineItemMoney,
} from './budgetMath'

const base: LineItemMoney = {
  budget: 1000,
  actual: 0,
  committed: 0,
  isAllowance: false,
  allowanceAmount: 0,
}

describe('budget math: regular line items', () => {
  it('openCommitment = committed - actual', () => {
    expect(openCommitment({ ...base, committed: 300, actual: 100 })).toBe(200)
  })

  it('openCommitment clamps negative to 0', () => {
    expect(openCommitment({ ...base, committed: 100, actual: 300 })).toBe(0)
  })

  it('spentAndCommitted = actual + openCommitment', () => {
    expect(spentAndCommitted({ ...base, actual: 100, committed: 300 })).toBe(300)
  })

  it('remaining = budget - spentAndCommitted', () => {
    expect(remaining({ ...base, budget: 1000, actual: 100, committed: 300 })).toBe(700)
  })

  it('variance = spentAndCommitted - budget', () => {
    expect(variance({ ...base, budget: 1000, actual: 1200 })).toBe(200)
    expect(variance({ ...base, budget: 1000, actual: 800 })).toBe(-200)
  })

  it('utilization is the raw ratio', () => {
    expect(utilization({ ...base, budget: 1000, actual: 900 })).toBeCloseTo(0.9, 10)
    expect(utilization({ ...base, budget: 0, actual: 0 })).toBe(0)
  })
})

describe('budget math: health thresholds', () => {
  it('overBudget when even one cent over', () => {
    expect(lineItemHealth({ ...base, budget: 1000, actual: 1000.01 })).toBe('overBudget')
  })

  it('nearLimit at exactly 90% utilization', () => {
    expect(lineItemHealth({ ...base, budget: 1000, actual: 900 })).toBe('nearLimit')
  })

  it('healthy just below 90%', () => {
    expect(lineItemHealth({ ...base, budget: 1000, actual: 899 })).toBe('healthy')
  })
})

describe('budget math: allowance line items', () => {
  const allowance: LineItemMoney = {
    budget: 1000,
    actual: 0,
    committed: 0,
    isAllowance: true,
    allowanceAmount: 1000,
  }

  it('carries no open commitment', () => {
    expect(openCommitment({ ...allowance, committed: 500 })).toBe(0)
  })

  it('measures remaining against allowanceAmount', () => {
    expect(remaining({ ...allowance, actual: 400 })).toBe(600)
  })

  it('variance is overage, clamped at 0 when under', () => {
    expect(variance({ ...allowance, actual: 1200 })).toBe(200)
    expect(variance({ ...allowance, actual: 500 })).toBe(0)
  })

  it('over allowance reports overBudget; under reports healthy', () => {
    expect(lineItemHealth({ ...allowance, actual: 1200 })).toBe('overBudget')
    expect(lineItemHealth({ ...allowance, actual: 500 })).toBe('healthy')
  })
})
