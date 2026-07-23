import { describe, expect, it } from 'vitest'
import {
  benchmarkStages,
  contingencyHealth,
  costPerSqft,
  rebalanceToBenchmark,
  stageForCategory,
  stageForLineItem,
  STAGE_BENCHMARK,
  STAGE_ORDER,
  type RebalanceItem,
} from './benchmarks'

describe('stageForCategory', () => {
  it('maps the seeded custom-home categories to NAHB stages', () => {
    expect(stageForCategory('General Requirements & Soft Costs')).toBe('siteWork')
    expect(stageForCategory('Site Work & Excavation')).toBe('siteWork')
    expect(stageForCategory('Foundation & Concrete')).toBe('foundation')
    expect(stageForCategory('Framing & Structural')).toBe('framing')
    expect(stageForCategory('Roofing')).toBe('exterior')
    expect(stageForCategory('Windows & Exterior Doors')).toBe('exterior')
    expect(stageForCategory('Exterior Finishes')).toBe('exterior')
    expect(stageForCategory('Plumbing')).toBe('majorSystems')
    expect(stageForCategory('HVAC')).toBe('majorSystems')
    expect(stageForCategory('Electrical')).toBe('majorSystems')
    expect(stageForCategory('Drywall')).toBe('interiorFinishes')
    expect(stageForCategory('Cabinetry & Countertops')).toBe('interiorFinishes')
    expect(stageForCategory('Landscaping & Hardscape')).toBe('finalSteps')
  })

  it('prefers the more specific keyword over a shorter substring', () => {
    // "Interior Trim & Millwork" contains "trim" but must not read as exterior/other.
    expect(stageForCategory('Interior Trim & Millwork')).toBe('interiorFinishes')
    // "Exterior Finishes" contains "finish" — must stay exterior, not interior.
    expect(stageForCategory('Exterior Finishes')).toBe('exterior')
  })

  it('returns null for a category it cannot classify', () => {
    expect(stageForCategory('Zamboni Rental')).toBeNull()
  })

  it('classifies fire protection with the major systems', () => {
    expect(stageForCategory('Fire Protection & Sprinklers')).toBe('majorSystems')
  })
})

describe('benchmarkStages', () => {
  it('reports every stage even when the project has no category for it', () => {
    const report = benchmarkStages([{ categoryName: 'Framing & Structural', budget: 100 }])
    expect(report.stages.map((s) => s.stage)).toEqual(STAGE_ORDER)
    expect(report.stages.find((s) => s.stage === 'foundation')?.budget).toBe(0)
  })

  it('computes shares against the classified total and flags under/over allocation', () => {
    // Framing at 50% of a $200 budget vs a 16.6% benchmark → materially over.
    const report = benchmarkStages([
      { categoryName: 'Framing & Structural', budget: 100 },
      { categoryName: 'Plumbing', budget: 100 },
    ])
    expect(report.classified).toBe(200)
    const framing = report.stages.find((s) => s.stage === 'framing')!
    expect(framing.actualPercent).toBeCloseTo(50)
    expect(framing.benchmarkPercent).toBe(STAGE_BENCHMARK.framing.percent)
    expect(framing.verdict).toBe('over')
    // Under-allocated stages report the positive dollars needed to reach the benchmark.
    const foundation = report.stages.find((s) => s.stage === 'foundation')!
    expect(foundation.verdict).toBe('under')
    expect(foundation.varianceAmount).toBeCloseTo(21) // 10.5% of 200
  })

  it('treats a stage within the tolerance band as on track', () => {
    // Exterior at exactly the 13.4% benchmark.
    const report = benchmarkStages([
      { categoryName: 'Roofing', budget: 13.4 },
      { categoryName: 'Plumbing', budget: 86.6 },
    ])
    expect(report.stages.find((s) => s.stage === 'exterior')?.verdict).toBe('onTrack')
  })

  it('sums multiple categories into one stage and lists them', () => {
    const report = benchmarkStages([
      { categoryName: 'Plumbing', budget: 10 },
      { categoryName: 'HVAC', budget: 20 },
      { categoryName: 'Electrical', budget: 30 },
    ])
    const systems = report.stages.find((s) => s.stage === 'majorSystems')!
    expect(systems.budget).toBe(60)
    expect(systems.categories).toEqual(['Electrical', 'HVAC', 'Plumbing'])
  })

  it('sets aside unclassifiable categories instead of skewing the shares', () => {
    const report = benchmarkStages([
      { categoryName: 'Framing & Structural', budget: 100 },
      { categoryName: 'Zamboni Rental', budget: 50 },
    ])
    expect(report.classified).toBe(100)
    expect(report.unmapped).toEqual([{ name: 'Zamboni Rental', budget: 50 }])
    expect(report.stages.find((s) => s.stage === 'framing')?.actualPercent).toBeCloseTo(100)
  })

  it('handles an empty budget without dividing by zero', () => {
    const report = benchmarkStages([])
    expect(report.classified).toBe(0)
    expect(report.stages.every((s) => s.actualPercent === 0)).toBe(true)
  })
})

describe('stageForLineItem', () => {
  it('splits a mixed category by line-item title', () => {
    // "Final, Cleanup & Supervision" holds both final-steps work and a supervision line.
    const cat = 'Final, Cleanup & Supervision'
    expect(stageForLineItem(cat, 'Final cleaning')).toBe('finalSteps')
    expect(stageForLineItem(cat, 'Waste removal & dumpsters')).toBe('finalSteps')
    expect(stageForLineItem(cat, 'Punch list & misc')).toBe('finalSteps')
    expect(stageForLineItem(cat, 'General supervision & overhead')).toBe('other')
  })

  it('pulls carrying costs out of the soft-costs category', () => {
    const cat = 'General Requirements & Soft Costs'
    expect(stageForLineItem(cat, "Builder's risk insurance")).toBe('other')
    expect(stageForLineItem(cat, 'Construction loan interest')).toBe('other')
    // Genuine site-work soft costs stay put.
    expect(stageForLineItem(cat, 'Building permits & fees')).toBe('siteWork')
    expect(stageForLineItem(cat, 'Architectural & engineering')).toBe('siteWork')
  })

  it('falls back to the category when the title says nothing special', () => {
    expect(stageForLineItem('Plumbing', 'Plumbing rough-in')).toBe('majorSystems')
    expect(stageForLineItem('Flooring', 'Carpet')).toBe('interiorFinishes')
  })
})

describe('rebalanceToBenchmark', () => {
  const item = (id: string, categoryName: string, title: string, budget: number): RebalanceItem => ({
    id,
    categoryName,
    title,
    budget,
  })

  it('conserves the grand total exactly', () => {
    const items = [
      item('1', 'Framing & Structural', 'Lumber', 185_000),
      item('2', 'Plumbing', 'Rough-in', 66_000),
      item('3', 'Drywall', 'Hang & finish', 46_000),
      item('4', 'Foundation & Concrete', 'Footings', 115_000),
    ]
    const before = items.reduce((a, i) => a + i.budget, 0)
    const changes = rebalanceToBenchmark(items)
    const byId = new Map(changes.map((c) => [c.id, c.to]))
    const after = items.reduce((a, i) => a + (byId.get(i.id) ?? i.budget), 0)
    expect(after).toBe(before)
  })

  it('moves money toward the under-allocated stage', () => {
    const items = [
      item('1', 'Framing & Structural', 'Lumber', 100_000),
      item('2', 'Plumbing', 'Rough-in', 100_000),
    ]
    const changes = rebalanceToBenchmark(items)
    // Framing 16.6 vs major systems 19.2 → plumbing should end up the larger of the two.
    const plumbing = changes.find((c) => c.id === '2')!
    const framing = changes.find((c) => c.id === '1')!
    expect(plumbing.to).toBeGreaterThan(framing.to)
    expect(plumbing.delta).toBeGreaterThan(0)
    expect(framing.delta).toBeLessThan(0)
  })

  it('splits a stage pro-rata so existing weighting survives', () => {
    const items = [
      item('1', 'Plumbing', 'Rough-in', 75_000),
      item('2', 'HVAC', 'Equipment', 25_000),
      item('3', 'Framing & Structural', 'Lumber', 100_000),
    ]
    const changes = rebalanceToBenchmark(items)
    const to = new Map(changes.map((c) => [c.id, c.to]))
    const plumbing = to.get('1') ?? 75_000
    const hvac = to.get('2') ?? 25_000
    // The 3:1 split within major systems is preserved.
    expect(plumbing / hvac).toBeCloseTo(3, 1)
  })

  it('leaves an unpriced $0 line at $0 rather than inventing a number', () => {
    const items = [
      item('1', 'Plumbing', 'Rough-in', 100_000),
      item('2', 'Fire Protection', 'Fire sprinkler system', 0),
      item('3', 'Framing & Structural', 'Lumber', 100_000),
    ]
    const changes = rebalanceToBenchmark(items)
    expect(changes.find((c) => c.id === '2')).toBeUndefined()
  })

  it('does not strand dollars in a stage the project has no line items for', () => {
    // No foundation/exterior/etc. at all — the two funded stages must still absorb it all.
    const items = [
      item('1', 'Framing & Structural', 'Lumber', 60_000),
      item('2', 'Plumbing', 'Rough-in', 40_000),
    ]
    const changes = rebalanceToBenchmark(items)
    const byId = new Map(changes.map((c) => [c.id, c.to]))
    expect((byId.get('1') ?? 60_000) + (byId.get('2') ?? 40_000)).toBe(100_000)
  })

  it('reports no changes for an already-balanced budget', () => {
    const items = [
      item('1', 'Framing & Structural', 'Lumber', 16_600),
      item('2', 'Plumbing', 'Rough-in', 19_200),
    ]
    // Renormalized over just these two stages they are already at their relative shares.
    const changes = rebalanceToBenchmark(items)
    expect(changes).toEqual([])
  })

  it('returns nothing for an empty or unbudgeted project', () => {
    expect(rebalanceToBenchmark([])).toEqual([])
    expect(rebalanceToBenchmark([item('1', 'Plumbing', 'Rough-in', 0)])).toEqual([])
  })
})

describe('costPerSqft', () => {
  it('flags a budget below the regional band and reports the gap', () => {
    const report = costPerSqft(1_500_000, 6000)!
    expect(report.perSqft).toBe(250)
    expect(report.verdict).toBe('inBand')

    const lean = costPerSqft(1_200_000, 6000)!
    expect(lean.perSqft).toBe(200)
    expect(lean.verdict).toBe('belowBand')
    // $250/sqft × 6,000 = $1.5M, so $300k short of the band floor.
    expect(lean.gapToBand).toBe(300_000)
  })

  it('reports no gap once inside the band', () => {
    expect(costPerSqft(2_400_000, 6000)!.gapToBand).toBe(0)
  })

  it('returns null when square footage is missing', () => {
    expect(costPerSqft(1_300_000, null)).toBeNull()
    expect(costPerSqft(1_300_000, 0)).toBeNull()
  })
})

describe('contingencyHealth', () => {
  it('rates contingency against the 5-15% band', () => {
    expect(contingencyHealth(1_300_000, 0).verdict).toBe('low')
    expect(contingencyHealth(1_300_000, 130_000).verdict).toBe('healthy')
    expect(contingencyHealth(1_300_000, 50_000).verdict).toBe('low')
  })

  it('reads an above-band reserve as conservative rather than a warning', () => {
    const carried = contingencyHealth(1_300_000, 200_000)
    expect(carried.percent).toBeCloseTo(15.38, 1)
    expect(carried.verdict).toBe('conservative')
  })

  it('does not divide by zero on an unbudgeted project', () => {
    expect(contingencyHealth(0, 0).percent).toBe(0)
  })
})
