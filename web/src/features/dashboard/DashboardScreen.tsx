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
import { useLineItems } from '../budget/useBudget'
import { useCurrentProject } from '../projects/currentProject'
import { useProjects } from '../projects/useProjects'
import { useExpenses } from '../expenses/useExpenses'

function progress(current: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.max(0, (current / limit) * 100))
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
  if (projectsLoading || itemsLoading || expensesLoading || ordersLoading || selectionsLoading) {
    return <div className="loading">Loading dashboard...</div>
  }

  const project = projects.find((p) => p.id === projectId) as Project | undefined
  const budgetLimit = project ? project.constructionBudget + project.contingencyBudget : sumBy(lineItems, (i) => i.budget)
  const baseBudget = project?.constructionBudget ?? sumBy(lineItems, (i) => i.budget)
  const actual = actualSpend(lineItems, expenses, allowanceSelections, changeOrders)
  const committed = committedSpend(lineItems, changeOrders)
  const paid = cashPaidTotal(expenses, changeOrders)
  const pending = pendingExposure(changeOrders)
  const allowanceRisk = allowanceOverage(lineItems, allowanceSelections, expenses)
  const projected = actual + committed + pending
  const overBudgetItems = lineItems.filter((li) => lineItemHealth(li) === 'overBudget')
  const nearLimitItems = lineItems.filter((li) => lineItemHealth(li) === 'nearLimit')
  const openExpenses = expenses.filter((e) => !e.isPaid)
  const recentExpenses = [...expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  return (
    <section className="dashboard">
      <div className="screen-heading">
        <div>
          <h1>{project?.name || 'Dashboard'}</h1>
          {project?.address && <p>{project.address}</p>}
        </div>
        <span className="status">{project?.status ?? 'active'}</span>
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
          <span>Projected</span>
          <strong>{fmt(projected)}</strong>
          <small>{fmt(budgetLimit - projected)} remaining</small>
        </div>
      </div>

      <div className="panel">
        <div className="row-between">
          <h2>Budget runway</h2>
          <strong>{progress(projected, budgetLimit).toFixed(0)}%</strong>
        </div>
        <div className="progress" aria-label="Projected budget use">
          <span style={{ width: `${progress(projected, budgetLimit)}%` }} />
        </div>
      </div>

      <div className="two-column">
        <div className="panel">
          <h2>Attention</h2>
          <ul className="plain-list">
            <li><strong>{overBudgetItems.length}</strong> over budget line items</li>
            <li><strong>{nearLimitItems.length}</strong> line items near limit</li>
            <li><strong>{openExpenses.length}</strong> open expenses</li>
            <li><strong>{fmt(allowanceRisk)}</strong> allowance overage</li>
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
