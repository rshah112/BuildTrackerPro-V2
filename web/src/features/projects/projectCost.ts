import type { Project } from '../../domain/types'
import { sumBy } from '../../lib/money'

// "All-in" project cost = what it actually costs to own the finished home, land included.
// Land acquisition (lot purchase + closing) is tracked SEPARATELY from the construction budget so
// it never distorts construction variance/EAC math — these helpers are the one place that combines
// them, so the dashboard, project info, brief, and export all report the same totals.

/** Lot purchase price + closing costs. */
export function landAcquisitionCost(p: Pick<Project, 'purchasePrice' | 'closingCosts'>): number {
  return sumBy([p.purchasePrice ?? 0, p.closingCosts ?? 0], (n) => n)
}

/** Construction budget + contingency reserve — the build-only budget ceiling. */
export function constructionCost(p: Pick<Project, 'constructionBudget' | 'contingencyBudget'>): number {
  return sumBy([p.constructionBudget ?? 0, p.contingencyBudget ?? 0], (n) => n)
}

/** Everything: land acquisition + construction + contingency. */
export function allInProjectCost(
  p: Pick<Project, 'purchasePrice' | 'closingCosts' | 'constructionBudget' | 'contingencyBudget'>,
): number {
  return landAcquisitionCost(p) + constructionCost(p)
}
