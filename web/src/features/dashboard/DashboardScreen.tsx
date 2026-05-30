import { useRows } from '../../data/hooks'
import type { AllowanceSelection, ChangeOrder, Expense, Project } from '../../domain/types'
import {
  actualSpend,
  allowanceOverage,
  cashPaidTotal,
  committedSpend,
  pendingExposure,
} from '../../lib/budgetAggregates'
import { lineItemHealth } from '../../lib/budgetMath'
import { fmt, sumBy } from '../../lib/money'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Feedback'
import { Donut } from '../../components/charts/Donut'
import { BarRow } from '../../components/charts/BarRow'
import { Sparkline } from '../../components/charts/Sparkline'
import { useLineItems } from '../budget/useBudget'
import { useCurrentProject } from '../projects/currentProject'
import { useProjects } from '../projects/useProjects'
import { useExpenses } from '../expenses/useExpenses'
import { localToday, nextFourteenDaysDue } from '../cashflow/cashFlow'

type Tone = 'brand' | 'warn' | 'danger'
function healthTone(used: number, limit: number): Tone {
  if (limit > 0 && used > limit) return 'danger'
  if (limit > 0 && used / limit >= 0.9) return 'warn'
  return 'brand'
}

export function DashboardScreen() {
  const { projectId } = useCurrentProject()
  const { data: projects = [], isLoading: projectsLoading } = useProjects()
  const { data: lineItems = [], isLoading: itemsLoading } = useLineItems(projectId!)
  const { data: expenses = [], isLoading: expensesLoading } = useExpenses(projectId!)
  const { data: changeOrders = [], isLoading: ordersLoading } = useRows<ChangeOrder>('change_orders', { projectId })
  const { data: allowanceSelections = [], isLoading: selectionsLoading } = useRows<AllowanceSelection>(
    'allowance_selections',
    { projectId },
  )

  if (!projectId) return null

  const loading = projectsLoading || itemsLoading || expensesLoading || ordersLoading || selectionsLoading
  if (loading) {
    return (
      <section>
        <ScreenHeader title="Dashboard" />
        <Skeleton height="200px" radius="var(--radius-lg)" />
        <div className="metric-grid">
          <Skeleton height="84px" radius="var(--radius-lg)" />
          <Skeleton height="84px" radius="var(--radius-lg)" />
          <Skeleton height="84px" radius="var(--radius-lg)" />
          <Skeleton height="84px" radius="var(--radius-lg)" />
        </div>
      </section>
    )
  }

  const project = projects.find((p) => p.id === projectId) as Project | undefined
  const budgetLimit = project
    ? project.constructionBudget + project.contingencyBudget
    : sumBy(lineItems, (i) => i.budget)
  const baseBudget = project?.constructionBudget ?? sumBy(lineItems, (i) => i.budget)
  const actual = actualSpend(lineItems, expenses, allowanceSelections, changeOrders)
  const committed = committedSpend(lineItems, changeOrders)
  const paid = cashPaidTotal(expenses, changeOrders)
  const pending = pendingExposure(changeOrders)
  const allowanceRisk = allowanceOverage(lineItems, allowanceSelections, expenses)
  const projected = actual + committed + pending
  const remaining = budgetLimit - projected
  const usedPct = budgetLimit > 0 ? Math.round((projected / budgetLimit) * 100) : 0
  const tone = healthTone(projected, budgetLimit)

  const overBudgetItems = lineItems.filter((li) => lineItemHealth(li) === 'overBudget')
  const nearLimitItems = lineItems.filter((li) => lineItemHealth(li) === 'nearLimit')
  const openExpenses = expenses.filter((e) => !e.isPaid)
  const pendingOrders = changeOrders.filter((c) => c.status === 'pending')
  const due14 = nextFourteenDaysDue(expenses, changeOrders, localToday())
  const recentExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  // Spend by category (top 5 by actual).
  const byCategory = new Map<string, { actual: number; budget: number }>()
  for (const li of lineItems) {
    const c = byCategory.get(li.categoryName) ?? { actual: 0, budget: 0 }
    c.actual += li.actual
    c.budget += li.budget
    byCategory.set(li.categoryName, c)
  }
  const categoryBars = [...byCategory.entries()]
    .filter(([name]) => name)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.actual - a.actual)
    .slice(0, 5)

  // Cumulative spend over time.
  const cumulative: number[] = []
  let running = 0
  for (const e of [...expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    running += e.amount
    cumulative.push(running)
  }

  return (
    <section className="dashboard">
      <ScreenHeader
        title={project?.name || 'Dashboard'}
        subtitle={project?.address || undefined}
        trailing={<Badge tone="neutral">{project?.status ?? 'active'}</Badge>}
      />

      <div className="hero-card">
        <Donut
          value={projected}
          max={budgetLimit}
          tone={tone}
          label={`${usedPct}%`}
          sublabel="of budget"
        />
        <div className="hero-figures">
          <div className="hero-figure">
            <span className="muted">Projected</span>
            <strong className={tone === 'danger' ? 'danger-text' : undefined}>{fmt(projected)}</strong>
          </div>
          <div className="hero-figure">
            <span className="muted">Remaining</span>
            <strong>{fmt(remaining)}</strong>
          </div>
          <div className="hero-figure">
            <span className="muted">Budget</span>
            <strong>{fmt(budgetLimit)}</strong>
          </div>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Budget</span>
          <strong>{fmt(baseBudget)}</strong>
          <small>{fmt(project?.contingencyBudget ?? 0)} contingency</small>
        </div>
        <div className="metric-card">
          <span>Actual spend</span>
          <strong>{fmt(actual)}</strong>
          <small>{fmt(paid)} cash paid</small>
        </div>
        <div className="metric-card">
          <span>Committed</span>
          <strong>{fmt(committed)}</strong>
          <small>{fmt(pending)} pending COs</small>
        </div>
        <div className="metric-card">
          <span>Remaining</span>
          <strong className={remaining < 0 ? 'danger-text' : undefined}>{fmt(remaining)}</strong>
          <small>{usedPct}% used</small>
        </div>
      </div>

      {categoryBars.length > 0 && (
        <div className="panel">
          <h2>Spend by category</h2>
          <div className="barrow-list">
            {categoryBars.map((c) => (
              <BarRow
                key={c.name}
                label={c.name}
                value={c.actual}
                max={c.budget || c.actual}
                valueText={`${fmt(c.actual)} / ${fmt(c.budget)}`}
                tone={c.actual > c.budget && c.budget > 0 ? 'danger' : 'brand'}
              />
            ))}
          </div>
        </div>
      )}

      {cumulative.length >= 2 && (
        <div className="panel">
          <div className="row-between">
            <h2>Spend over time</h2>
            <strong>{fmt(running)}</strong>
          </div>
          <Sparkline values={cumulative} />
        </div>
      )}

      <div className="two-column">
        <div className="panel">
          <h2>Attention</h2>
          <ul className="plain-list">
            <li>
              <strong>{overBudgetItems.length}</strong> over budget line items
            </li>
            <li>
              <strong>{nearLimitItems.length}</strong> line items near limit
            </li>
            <li>
              <strong>{openExpenses.length}</strong> open expenses
            </li>
            <li>
              <strong>{pendingOrders.length}</strong> pending change orders
            </li>
            <li>
              <strong>{fmt(due14)}</strong> due in the next 14 days
            </li>
            <li>
              <strong>{fmt(allowanceRisk)}</strong> allowance overage
            </li>
          </ul>
        </div>

        <div className="panel">
          <h2>Recent expenses</h2>
          {recentExpenses.length === 0 && <p>No expenses yet.</p>}
          <ul className="plain-list">
            {recentExpenses.map((e: Expense) => (
              <li key={e.id} className="row-between">
                <span>{e.vendorName || e.categoryName || 'Expense'}</span>
                <strong>{fmt(e.amount)}</strong>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
