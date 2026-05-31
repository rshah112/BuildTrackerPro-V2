import { describe, expect, it } from 'vitest'
import { PROJECT_TEMPLATES, makeBudgetDraft } from './projectTemplates'

describe('projectTemplates', () => {
  it('every template category-percent set sums to 100', () => {
    for (const [type, cats] of Object.entries(PROJECT_TEMPLATES)) {
      const sum = (cats ?? []).reduce((s, c) => s + c.percent, 0)
      expect(Math.round(sum), `${type} percents`).toBe(100)
    }
  })

  it('allocates a category target ≈ percent × budget', () => {
    const { categories } = makeBudgetDraft('customHome', 1_000_000)
    expect(categories.length).toBe(8)
    // Site Work is 7.6% of $1,000,000 = $76,000 (±rounding of its line items)
    const site = categories.find((c) => c.name === 'Site Work')!
    expect(site.targetBudget).toBeGreaterThan(75_000)
    expect(site.targetBudget).toBeLessThan(77_000)
  })

  it('line items roll up to ~the full budget (rounding aside)', () => {
    const { lineItems } = makeBudgetDraft('customHome', 1_000_000)
    const total = lineItems.reduce((s, l) => s + l.budget, 0)
    expect(Math.abs(total - 1_000_000)).toBeLessThan(100) // whole-dollar rounding drift only
  })

  it('scales with the budget amount', () => {
    const small = makeBudgetDraft('poolBackyard', 200_000)
    const big = makeBudgetDraft('poolBackyard', 600_000)
    const sumSmall = small.categories.reduce((s, c) => s + c.targetBudget, 0)
    const sumBig = big.categories.reduce((s, c) => s + c.targetBudget, 0)
    expect(sumBig).toBeGreaterThan(sumSmall * 2.9) // ~3x
  })

  it('returns nothing for custom or non-positive budget', () => {
    expect(makeBudgetDraft('custom', 500_000).categories).toHaveLength(0)
    expect(makeBudgetDraft('customHome', 0).categories).toHaveLength(0)
    expect(makeBudgetDraft('customHome', -5).lineItems).toHaveLength(0)
  })
})
