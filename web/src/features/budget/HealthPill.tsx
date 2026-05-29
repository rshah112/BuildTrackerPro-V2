import { lineItemHealth, type BudgetHealth } from '../../lib/budgetMath'
import type { LineItemMoney } from '../../lib/budgetMath'

const LABELS: Record<BudgetHealth, string> = {
  healthy: 'On track',
  nearLimit: 'Near limit',
  overBudget: 'Over budget',
}

export function HealthPill({ item }: { item: LineItemMoney }) {
  const health = lineItemHealth(item)
  return (
    <span data-testid="health-pill" data-health={health} className={`health-pill health-${health}`}>
      {LABELS[health]}
    </span>
  )
}
