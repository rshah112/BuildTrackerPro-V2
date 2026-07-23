import { useMemo } from 'react'
import type { BudgetLineItem, Project } from '../../domain/types'
import { fmt, sumBy } from '../../lib/money'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { SummaryStrip } from '../../components/ui/SummaryStrip'
import {
  benchmarkStages,
  contingencyHealth,
  costPerSqft,
  CONTINGENCY_BAND,
  type StageRow,
} from './benchmarks'

const VERDICT_TONE: Record<StageRow['verdict'], BadgeTone> = {
  under: 'warn',
  onTrack: 'success',
  over: 'info',
}

const VERDICT_LABEL: Record<StageRow['verdict'], string> = {
  under: 'Under',
  onTrack: 'On track',
  over: 'Over',
}

// Round before choosing the sign, so a variance of -0.015 prints "0.0 pts", not "−0.0 pts".
function pts(n: number): string {
  const rounded = Number(n.toFixed(1))
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : ''
  return `${sign}${Math.abs(rounded).toFixed(1)} pts`
}

/** Benchmarks the project's allocation against published industry cost shares.
 *  Read-only — it never touches budgets, it only tells you where they sit. */
export function BenchmarkPanel({
  project,
  lineItems,
}: {
  project: Project | undefined
  lineItems: BudgetLineItem[]
}) {
  const report = useMemo(
    () => benchmarkStages(lineItems.map((li) => ({ categoryName: li.categoryName, budget: li.budget }))),
    [lineItems],
  )

  if (!project) return null

  const base = project.constructionBudget || sumBy(lineItems, (li) => li.budget)
  const contingency = project.contingencyBudget ?? 0
  const allIn = base + contingency
  const sqft = costPerSqft(allIn, project.squareFootage)
  const reserve = contingencyHealth(base, contingency)

  const flagged = report.stages.filter((stage) => stage.verdict !== 'onTrack' && stage.budget > 0)
  const biggestGap = [...report.stages].sort((a, b) => b.varianceAmount - a.varianceAmount)[0]

  return (
    <div className="benchmark-panel">
      <SummaryStrip
        label="Benchmark summary"
        metrics={[
          {
            label: 'All-in cost per sq ft',
            value: sqft ? `$${Math.round(sqft.perSqft)}` : '—',
            detail: sqft
              ? `${fmt(allIn)} ÷ ${project.squareFootage!.toLocaleString()} sq ft · band $${sqft.band.low}–$${sqft.band.high}`
              : 'Set square footage in Project Info',
            tone: !sqft ? 'default' : sqft.verdict === 'belowBand' ? 'warn' : 'success',
          },
          {
            label: 'Contingency',
            value: `${reserve.percent.toFixed(1)}%`,
            detail: `${fmt(contingency)} held · ${CONTINGENCY_BAND.low}–${CONTINGENCY_BAND.high}% typical`,
            tone: reserve.verdict === 'low' ? 'danger' : 'success',
          },
          {
            label: 'Stages off benchmark',
            value: String(flagged.length),
            detail: flagged.length === 0 ? 'Allocation tracks the industry mix' : 'See the table below',
            tone: flagged.length === 0 ? 'success' : 'warn',
          },
        ]}
      />

      {sqft?.verdict === 'belowBand' && (
        <p className="benchmark-callout" role="note">
          <strong>Priced below the local market band.</strong> At{' '}
          <strong>${Math.round(sqft.perSqft)}/sq ft</strong> all-in, this budget sits under the{' '}
          ${sqft.band.low}–${sqft.band.high}/sq ft range typical for a custom home in {sqft.band.market}.
          Reaching the bottom of that band would take about <strong>{fmt(sqft.gapToBand)}</strong> more.
          That is not automatically wrong — acting as your own GC removes a builder&rsquo;s 10–20% fee —
          but it means there is little room for the mix below to be light as well.
        </p>
      )}

      <div className="benchmark-table-wrap">
        <table className="data-table">
          <caption className="sr-only">Budget allocation vs. industry benchmark by construction stage</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col" className="cell-number">Budgeted</th>
              <th scope="col" className="cell-number">Your mix</th>
              <th scope="col" className="cell-number">Benchmark</th>
              <th scope="col" className="cell-number">Variance</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {report.stages.map((stage) => (
              <tr key={stage.stage}>
                <td className="benchmark-stage-cell">
                  <strong>{stage.label}</strong>
                  {stage.categories.length > 0 && <span>{stage.categories.join(', ')}</span>}
                </td>
                <td data-label="Budgeted" className="cell-number">{fmt(stage.budget)}</td>
                <td data-label="Your mix" className="cell-number">{stage.actualPercent.toFixed(1)}%</td>
                <td data-label="Benchmark" className="cell-number">{stage.benchmarkPercent.toFixed(1)}%</td>
                <td data-label="Variance" className="cell-number">
                  {/* One wrapper element so the mobile card layout, which flexes each cell
                      into a label/value pair, doesn't split these two lines apart. */}
                  <span className="benchmark-variance">
                    <span className={stage.verdict === 'under' ? 'danger-text' : undefined}>
                      {pts(stage.variancePoints)}
                    </span>
                    <small className="benchmark-variance-money">
                      {Math.round(stage.varianceAmount) === 0
                        ? 'on target'
                        : stage.varianceAmount > 0
                          ? `${fmt(stage.varianceAmount)} short`
                          : `${fmt(-stage.varianceAmount)} over`}
                    </small>
                  </span>
                </td>
                <td data-label="Status" className="benchmark-status-cell">
                  <Badge tone={VERDICT_TONE[stage.verdict]}>{VERDICT_LABEL[stage.verdict]}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {biggestGap && biggestGap.varianceAmount > 0 && (
        <p className="benchmark-callout" role="note">
          <strong>Biggest gap: {biggestGap.label.toLowerCase()}.</strong> It holds{' '}
          {biggestGap.actualPercent.toFixed(1)}% of the allocated budget against a{' '}
          {biggestGap.benchmarkPercent.toFixed(1)}% benchmark — about{' '}
          <strong>{fmt(biggestGap.varianceAmount)}</strong> light. Worth re-checking against live
          subcontractor quotes before locking the number.
        </p>
      )}

      {report.unmapped.length > 0 && (
        <p className="benchmark-note muted">
          Not classified into a stage (excluded from the percentages above):{' '}
          {report.unmapped.map((u) => `${u.name} (${fmt(u.budget)})`).join(', ')}.
        </p>
      )}

      <p className="benchmark-note muted">
        Stage shares from the NAHB <em>Cost of Constructing a Home</em> 2024 survey, the industry
        reference for how a new single-family build divides across the eight stages. A stage within
        2 percentage points of its benchmark reads as on track. Benchmarks describe a national
        average mix, not your drawings — a deliberate choice (a bigger kitchen, a simpler roof) will
        legitimately show as variance.
      </p>
    </div>
  )
}
