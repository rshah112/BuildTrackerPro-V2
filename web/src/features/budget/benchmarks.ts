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
  ['final step', 'finalSteps'],
  ['cleanup', 'finalSteps'],
  ['clean up', 'finalSteps'],
  ['punch', 'finalSteps'],
  ['closeout', 'finalSteps'],
  ['close out', 'finalSteps'],
  ['walkthrough', 'finalSteps'],

  ['general condition', 'other'],
  ['contingency', 'other'],
  ['other', 'other'],
].sort((a, b) => b[0].length - a[0].length) as [string, Stage][]

// Titles that belong to NAHB's "other" bucket (general conditions / carrying costs) even
// though they sit inside a trade category. Without this, a mixed category like
// "Final, Cleanup & Supervision" would drag its cleanup and punch-list work into "other"
// on the strength of one supervision line — or vice versa.
const SOFT_COST_TITLES = [
  'supervision',
  'overhead',
  'general condition',
  'builder’s risk',
  "builder's risk",
  'builders risk',
  'insurance',
  'loan interest',
  'construction loan',
  'financing',
]

/** Classify a budget category name into a NAHB stage, or null when nothing matches. */
export function stageForCategory(name: string): Stage | null {
  const key = name.toLowerCase()
  for (const [needle, stage] of STAGE_KEYWORDS) if (key.includes(needle)) return stage
  return null
}

/** Classify a single line item: an unambiguous soft-cost title wins over its category,
 *  otherwise the category decides. */
export function stageForLineItem(categoryName: string, title = ''): Stage | null {
  const key = title.toLowerCase()
  if (SOFT_COST_TITLES.some((needle) => key.includes(needle))) return 'other'
  return stageForCategory(categoryName)
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

export interface BenchmarkInput {
  categoryName: string
  title?: string
  budget: number
}

export function benchmarkStages(items: BenchmarkInput[]): BenchmarkReport {
  const byStage = new Map<Stage, { budget: number; categories: Set<string> }>()
  const unmappedByName = new Map<string, number>()

  for (const item of items) {
    const stage = stageForLineItem(item.categoryName, item.title)
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

// --- Rebalancing to the benchmark ----------------------------------------------------

export interface RebalanceItem extends BenchmarkInput {
  id: string
}

export interface RebalanceChange {
  id: string
  categoryName: string
  title: string
  stage: Stage
  from: number
  to: number
  delta: number
}

/**
 * Re-cuts every line item so each NAHB stage lands on its benchmark share, keeping the
 * grand total identical to the pound.
 *
 * Rules that matter:
 * - Only stages that already hold money take part; their benchmark percentages are
 *   renormalized over that subset, so a project with no landscaping doesn't lose dollars
 *   into a stage with nowhere to put them.
 * - Within a stage, the target is split pro-rata across that stage's line items, so the
 *   relative weighting a builder already set survives.
 * - A $0 line stays $0. It has no pro-rata weight, and inventing a number for a line
 *   nobody has priced (a sprinkler system, say) would be a guess dressed as an estimate.
 * - Rounding remainders land on the largest line in the stage, so the totals reconcile
 *   exactly rather than drifting by a few dollars per stage.
 */
export function rebalanceToBenchmark(items: RebalanceItem[]): RebalanceChange[] {
  const total = sumBy(items, (i) => i.budget)
  if (total <= 0) return []

  const byStage = new Map<Stage, RebalanceItem[]>()
  for (const item of items) {
    const stage = stageForLineItem(item.categoryName, item.title)
    if (!stage) continue
    const bucket = byStage.get(stage)
    if (bucket) bucket.push(item)
    else byStage.set(stage, [item])
  }

  // Only stages holding money can absorb a target; renormalize the benchmark over them.
  const funded = [...byStage.entries()].filter(([, list]) => sumBy(list, (i) => i.budget) > 0)
  const pctTotal = funded.reduce((acc, [stage]) => acc + STAGE_BENCHMARK[stage].percent, 0)
  if (pctTotal <= 0) return []

  // Stage targets in whole dollars, with the rounding remainder on the largest stage.
  const stageTargets = funded.map(([stage, list]) => ({
    stage,
    list,
    stageTotal: sumBy(list, (i) => i.budget),
    target: Math.round((total * STAGE_BENCHMARK[stage].percent) / pctTotal),
  }))
  const targetSum = stageTargets.reduce((acc, s) => acc + s.target, 0)
  if (targetSum !== Math.round(total)) {
    const largest = stageTargets.reduce((a, b) => (b.target > a.target ? b : a))
    largest.target += Math.round(total) - targetSum
  }

  const changes: RebalanceChange[] = []
  for (const { stage, list, stageTotal, target } of stageTargets) {
    const priced = list.filter((item) => item.budget > 0)
    const allocations = priced.map((item) => ({
      item,
      to: Math.round((target * item.budget) / stageTotal),
    }))
    const allocated = allocations.reduce((acc, a) => acc + a.to, 0)
    if (allocated !== target && allocations.length > 0) {
      const largest = allocations.reduce((a, b) => (b.to > a.to ? b : a))
      largest.to += target - allocated
    }
    for (const { item, to } of allocations) {
      if (to === item.budget) continue
      changes.push({
        id: item.id,
        categoryName: item.categoryName,
        title: item.title ?? '',
        stage,
        from: item.budget,
        to,
        delta: to - item.budget,
      })
    }
  }
  return changes
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
