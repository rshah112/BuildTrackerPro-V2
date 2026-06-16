import { describe, it, expect } from 'vitest'
import { landAcquisitionCost, constructionCost, allInProjectCost } from './projectCost'

describe('projectCost', () => {
  const p = {
    purchasePrice: 1_100_000,
    closingCosts: 38_500.5,
    constructionBudget: 1_500_000,
    contingencyBudget: 150_000,
  }

  it('lands the acquisition total', () => {
    expect(landAcquisitionCost(p)).toBe(1_138_500.5)
  })

  it('sums construction + contingency', () => {
    expect(constructionCost(p)).toBe(1_650_000)
  })

  it('combines everything for the all-in cost', () => {
    expect(allInProjectCost(p)).toBe(2_788_500.5)
  })

  it('treats missing values as zero', () => {
    expect(allInProjectCost({ purchasePrice: 0, closingCosts: 0, constructionBudget: 0, contingencyBudget: 0 })).toBe(0)
    // @ts-expect-error — exercise the nullish guards
    expect(landAcquisitionCost({})).toBe(0)
  })
})
