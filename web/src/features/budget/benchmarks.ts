// Benchmarks a project's budget allocation against published industry cost shares.
//
// Source: NAHB "Cost of Constructing a Home" (2024 survey, published Jan 2025), which
// breaks construction cost into eight stages. Those eight stages are the only shares
// NAHB publishes, so we roll the project's (much more granular) categories up into the
// same eight buckets rather than inventing per-category precision that doesn't exist.
//
// A category that doesn't match any known bucket is reported separately as unmapped, so
// the shares always reconcile to 100% of what was actually classified.

import { sum, sumBy, diff } from '../../lib/money'

export type Stage =
  | 'siteWork'
  | 'foundation'
  | 'framing'
  | 'exterior'
  | 'majorSystems'
  | 'interiorFinishes'
  | 'finalSteps'
  | 'other'

/** NAHB 2024 stage shares of total construction cost (sums to 100). */
export const STAGE_BENCHMARK: Record<Stage, { label: string; percent: number }> = {
  siteWork: { label: 'Site work & soft costs', percent: 7.6 },
  foundation: { label: 'Foundation', percent: 10.5 },
  framing: { label: 'Framing', percent: 16.6 },
  exterior: { label: 'Exterior finishes', percent: 13.4 },
  majorSystems: { label: 'Major system rough-ins', percent: 19.2 },
  interiorFinishes: { label: 'Interior finishes', percent: 24.1 },
  finalSteps: { label: 'Final steps', percent: 6.5 },
  other: { label: 'Other', percent: 2.1 },
}

export const STAGE_ORDER: Stage[] = [
  'siteWork',
  'foundation',
  'framing',
  'exterior',
  'majorSystems',
  'interiorFinishes',
  'finalSteps',
  'other',
]

// Keyword → stage. Matched against the lower-cased category name, longest key first, so
// "interior trim" beats a bare "trim" and "exterior finishes" never falls into interior.
const STAGE_KEYWORDS: [string, Stage][] = [
  ['general requirement', 'siteWork'],
  ['soft cost', 'siteWork'],
  ['design & permit', 'siteWork'],
  ['design and permit', 'siteWork'],
  ['professional fee', 'siteWork'],
  ['permit', 'siteWork'],
  ['site work', 'siteWork'],
  ['sitework', 'siteWork'],
  ['excavation', 'siteWork'],
  ['demo', 'siteWork'],

  ['foundation', 'foundation'],
  ['concrete', 'foundation'],
  ['footing', 'foundation'],

  ['framing', 'framing'],
  ['structural', 'framing'],

  ['exterior finish', 'exterior'],
  ['exterior', 'exterior'],
  ['roofing', 'exterior'],
  ['roof', 'exterior'],
  ['siding', 'exterior'],
  ['window', 'exterior'],
  ['masonry', 'exterior'],

  ['plumbing', 'majorSystems'],
  ['hvac', 'majorSystems'],
  ['mechanical', 'majorSystems'],
  ['electrical', 'majorSystems'],
  ['mep', 'majorSystems'],
  ['fire protection', 'majorSystems'],
  ['sprinkler', 'majorSystems'],
  ['major system', 'majorSystems'],

  ['insulation', 'interiorFinishes'],
  ['drywall', 'interiorFinishes'],
  ['interior trim', 'interiorFinishes'],
  ['millwork', 'interiorFinishes'],
  ['cabinet', 'interiorFinishes'],
  ['countertop', 'interiorFinishes'],
  ['flooring', 'interiorFinishes'],
  ['tile', 'interiorFinishes'],
  ['painting', 'interiorFinishes'],
  ['paint', 'interiorFinishes'],
  ['appliance', 'interiorFinishes'],
  ['interior special', 'interiorFinishes'],
  ['interior finish', 'interiorFinishes'],
  ['vanity', 'interiorFinishes'],

  ['landscap', 'finalSteps'],
  ['hardscape', 'finalSteps'],
  ['driveway', 'finalSteps'],
  ['deck', 'finalSteps'],
  ['final & site', 'finalSteps'],
  ['final site', 'finalSteps'],
  ['punch', 'finalSteps'],
  ['closeout', 'finalSteps'],
  ['close out', 'finalSteps'],
  ['walkthrough', 'finalSteps'],

  ['supervision', 'other'],
  ['overhead', 'other'],
  ['general condition', 'other'],
  ['contingency', 'other'],
  ['insurance', 'other'],
  ['loan interest', 'other'],
  ['financing', 'other'],
  ['other', 'other'],
].sort((a, b) => b[0].length - a[0].length) as [string, Stage][]

/** Classify a budget category name into a NAHB stage, or null when nothing matches. */
export function stageForCategory(name: string): Stage | null {
  const key = name.toLowerCase()
  for (const [needle, stage] of STAGE_KEYWORDS) if (key.includes(needle)) return stage
  return null
}

export interface StageRow {
  stage: Stage
  label: string
  budget: number
  /** Percent of the classified total this stage actually holds. */
  actualPercent: number
  benchmarkPercent: number
  /** actualPercent − benchmarkPercent, in percentage points. */
  variancePoints: number
  /** Dollars that would move this stage onto the benchmark share (+ = under-allocated). */
  varianceAmount: number
  verdict: 'under' | 'onTrack' | 'over'
  categories: string[]
}

export interface BenchmarkReport {
  stages: StageRow[]
  classified: number
  unmapped: { name: string; budget: number }[]
}

/** A stage within this many percentage points of the benchmark reads as on-track. */
const TOLERANCE_POINTS = 2

export function benchmarkStages(
  items: { categoryName: string; budget: number }[],
): BenchmarkReport {
  const byStage = new Map<Stage, { budget: number; categories: Set<string> }>()
  const unmappedByName = new Map<string, number>()

  for (const item of items) {
    const stage = stageForCategory(item.categoryName)
    if (!stage) {
      unmappedByName.set(item.categoryName, sum([unmappedByName.get(item.categoryName) ?? 0, item.budget]))
      continue
    }
    const bucket = byStage.get(stage) ?? { budget: 0, categories: new Set<string>() }
    bucket.budget = sum([bucket.budget, item.budget])
    bucket.categories.add(item.categoryName)
    byStage.set(stage, bucket)
  }

  const classified = sumBy([...byStage.values()], (b) => b.budget)

  const stages: StageRow[] = STAGE_ORDER.map((stage) => {
    const bucket = byStage.get(stage)
    const budget = bucket?.budget ?? 0
    const benchmarkPercent = STAGE_BENCHMARK[stage].percent
    const actualPercent = classified > 0 ? (budget / classified) * 100 : 0
    const variancePoints = actualPercent - benchmarkPercent
    // What the stage *should* hold at the benchmark share, vs what it does.
    const target = (classified * benchmarkPercent) / 100
    return {
      stage,
      label: STAGE_BENCHMARK[stage].label,
      budget,
      actualPercent,
      benchmarkPercent,
      variancePoints,
      varianceAmount: diff(target, budget),
      verdict:
        Math.abs(variancePoints) <= TOLERANCE_POINTS ? 'onTrack' : variancePoints < 0 ? 'under' : 'over',
      categories: [...(bucket?.categories ?? [])].sort((a, b) => a.localeCompare(b)),
    }
  })

  return {
    stages,
    classified,
    unmapped: [...unmappedByName.entries()]
      .map(([name, budget]) => ({ name, budget }))
      .sort((a, b) => b.budget - a.budget),
  }
}

// --- Cost per square foot ------------------------------------------------------------
//
// Band for a custom (non-production) home in Bergen County / North Jersey, 2026. The
// low end is builder-grade custom; luxury finishes run well past the high end.

export const SQFT_BAND = { low: 250, high: 600, market: 'Bergen County, NJ' }

export type SqftVerdict = 'belowBand' | 'inBand' | 'aboveBand'

export interface SqftReport {
  perSqft: number
  verdict: SqftVerdict
  band: typeof SQFT_BAND
  /** Extra dollars needed to reach the bottom of the band (0 when already in it). */
  gapToBand: number
}

/** `budget` should be the all-in construction number (base + contingency). */
export function costPerSqft(budget: number, squareFootage: number | null): SqftReport | null {
  if (!squareFootage || squareFootage <= 0 || budget <= 0) return null
  const perSqft = budget / squareFootage
  return {
    perSqft,
    verdict: perSqft < SQFT_BAND.low ? 'belowBand' : perSqft > SQFT_BAND.high ? 'aboveBand' : 'inBand',
    band: SQFT_BAND,
    gapToBand: perSqft < SQFT_BAND.low ? diff(SQFT_BAND.low * squareFootage, budget) : 0,
  }
}

// --- Contingency ---------------------------------------------------------------------

/** Industry-standard contingency for a custom home, as a share of the base budget. */
export const CONTINGENCY_BAND = { low: 5, high: 15 }

/** Only a *thin* contingency is a problem worth flagging — carrying more than the band
 *  is a deliberate, defensive choice, so it reads as "conservative", never as a warning. */
export function contingencyHealth(baseBudget: number, contingency: number) {
  const percent = baseBudget > 0 ? (contingency / baseBudget) * 100 : 0
  return {
    percent,
    verdict:
      percent < CONTINGENCY_BAND.low
        ? 'low'
        : percent > CONTINGENCY_BAND.high
          ? 'conservative'
          : 'healthy',
    band: CONTINGENCY_BAND,
  } as const
}
