import { describe, expect, it } from 'vitest'
import {
  benchmarkStages,
  contingencyHealth,
  costPerSqft,
  stageForCategory,
  STAGE_BENCHMARK,
  STAGE_ORDER,
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
