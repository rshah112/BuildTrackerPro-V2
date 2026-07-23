// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { BenchmarkPanel } from './BenchmarkPanel'
import type { BudgetLineItem, Project } from '../../domain/types'

// The real seeded "New Home Construction" allocation, summing to $1.3M. Categories are
// condensed to a single representative line except the two that genuinely mix stages —
// those keep their real lines so the title-level classification is actually exercised.
const CATEGORY_BUDGETS: [string, number, string?][] = [
  ['General Requirements & Soft Costs', 50_000, 'Building permits & fees'],
  ['General Requirements & Soft Costs', 8_000, "Builder's risk insurance"],
  ['Site Work & Excavation', 78_000],
  ['Foundation & Concrete', 115_000],
  ['Framing & Structural', 185_000],
  ['Roofing', 40_000],
  ['Windows & Exterior Doors', 56_000],
  ['Exterior Finishes', 78_000],
  ['Plumbing', 66_000],
  ['HVAC', 64_000],
  ['Electrical', 60_000],
  ['Insulation', 28_000],
  ['Drywall', 46_000],
  ['Interior Trim & Millwork', 60_000],
  ['Cabinetry & Countertops', 78_000],
  ['Flooring', 64_000],
  ['Painting', 40_000],
  ['Appliances', 34_000],
  ['Interior Specialties', 36_000],
  ['Landscaping & Hardscape', 56_000],
  ['Final, Cleanup & Supervision', 40_000, 'General supervision & overhead'],
  ['Final, Cleanup & Supervision', 18_000, 'Final cleaning, waste removal & punch list'],
]

const lineItems = CATEGORY_BUDGETS.map(
  ([categoryName, budget, title], i) =>
    ({ id: `li${i}`, categoryName, budget, title: title ?? categoryName, actual: 0, committed: 0 }) as BudgetLineItem,
)

const project = {
  id: 'p1',
  name: 'New Home Construction',
  constructionBudget: 1_300_000,
  contingencyBudget: 200_000,
  squareFootage: 6000,
} as Project

const renderPanel = (overrides: Partial<Project> = {}) =>
  render(<BenchmarkPanel project={{ ...project, ...overrides }} lineItems={lineItems} />)

/** Read a stage's row out of the benchmark table by its visible label. */
function stageRow(label: string) {
  return screen.getByText(label).closest('tr')!
}

describe('BenchmarkPanel', () => {
  it('reports all-in cost per square foot including the contingency reserve', () => {
    renderPanel()
    // ($1.3M base + $200k contingency) / 6,000 sq ft = $250/sq ft.
    expect(screen.getByText('$250')).toBeInTheDocument()
    expect(screen.getByText(/6,000 sq ft/)).toBeInTheDocument()
  })

  it('flags the budget as below band once the reserve is excluded', () => {
    // Base budget alone is $1.3M / 6,000 = ~$217/sq ft, under the $250 floor.
    renderPanel({ contingencyBudget: 0 })
    expect(screen.getByText(/Priced below the local market band/)).toBeInTheDocument()
  })

  it('rates the carried contingency against the industry band', () => {
    renderPanel()
    // $200k on a $1.3M base = 15.4%.
    expect(screen.getByText('15.4%')).toBeInTheDocument()
  })

  it('identifies major system rough-ins as the materially under-allocated stage', () => {
    renderPanel()
    // Plumbing + HVAC + Electrical = $190k of $1.3M = 14.6% against a 19.2% benchmark.
    const row = stageRow('Major system rough-ins')
    expect(within(row).getByText('$190,000')).toBeInTheDocument()
    expect(within(row).getByText('14.6%')).toBeInTheDocument()
    expect(within(row).getByText('19.2%')).toBeInTheDocument()
    expect(within(row).getByText('Under')).toBeInTheDocument()
  })

  it('identifies interior finishes as the over-allocated stage', () => {
    renderPanel()
    // The eight interior categories total $386k = 29.7% against a 24.1% benchmark.
    const row = stageRow('Interior finishes')
    expect(within(row).getByText('$386,000')).toBeInTheDocument()
    expect(within(row).getByText('29.7%')).toBeInTheDocument()
    expect(within(row).getByText('Over')).toBeInTheDocument()
  })

  it('classifies every seeded category so nothing lands in the unmapped bucket', () => {
    renderPanel()
    expect(screen.queryByText(/Not classified into a stage/)).not.toBeInTheDocument()
  })

  it('splits the mixed supervision/cleanup category across Other and Final steps', () => {
    renderPanel()
    // Supervision ($40k) + builder's risk ($8k) are general conditions...
    expect(within(stageRow('Other')).getByText('$48,000')).toBeInTheDocument()
    // ...while cleaning/waste/punch ($18k) join landscaping ($56k) in final steps.
    expect(within(stageRow('Final steps')).getByText('$74,000')).toBeInTheDocument()
    // Both then sit inside tolerance, so only 4 stages are genuinely off benchmark.
    expect(within(stageRow('Other')).getByText('On track')).toBeInTheDocument()
    expect(within(stageRow('Final steps')).getByText('On track')).toBeInTheDocument()
  })

  it('names the biggest shortfall in the callout', () => {
    renderPanel()
    expect(screen.getByText(/Biggest gap: major system rough-ins/)).toBeInTheDocument()
  })

  it('prompts for square footage instead of showing a bogus rate when it is unset', () => {
    renderPanel({ squareFootage: null })
    expect(screen.getByText('Set square footage in Project Info')).toBeInTheDocument()
  })

  it('renders nothing when the project has not loaded yet', () => {
    const { container } = render(<BenchmarkPanel project={undefined} lineItems={lineItems} />)
    expect(container).toBeEmptyDOMElement()
  })
})
