import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PieChart, FolderKanban } from 'lucide-react'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense, Project } from '../../domain/types'
import { actualSpend, committedSpend, pendingExposure } from '../../lib/budgetAggregates'
import { fmt } from '../../lib/money'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { SectionCard } from '../../components/ui/SectionCard'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useRows } from '../../data/hooks'
import { useProjects } from '../projects/useProjects'
import { useCurrentProject } from '../projects/currentProject'

interface Roll {
  project: Project
  budget: number
  actual: number
  committed: number
  pending: number
  projected: number
  remaining: number
  usedPct: number
  tone: BadgeTone
}

function tone(projected: number, limit: number): BadgeTone {
  if (limit > 0 && projected > limit) return 'danger'
  if (limit > 0 && projected / limit >= 0.9) return 'warn'
  return 'brand'
}

export function PortfolioScreen() {
  const { data: projects = [], isLoading, error } = useProjects()
  // Unfiltered child queries — RLS still scopes every row to the owner, so this is the
  // whole portfolio. Aggregated per-project client-side below.
  const { data: lineItems = [] } = useRows<BudgetLineItem>('budget_line_items')
  const { data: expenses = [] } = useRows<Expense>('expenses')
  const { data: changeOrders = [] } = useRows<ChangeOrder>('change_orders')
  const { data: allowances = [] } = useRows<AllowanceSelection>('allowance_selections')
  const { setProjectId } = useCurrentProject()
  const navigate = useNavigate()

  const rolls = useMemo<Roll[]>(() => {
    return projects
      .map((project) => {
        const items = lineItems.filter((i) => i.projectId === project.id)
        const exp = expenses.filter((e) => e.projectId === project.id)
        const cos = changeOrders.filter((c) => c.projectId === project.id)
        const sels = allowances.filter((a) => a.projectId === project.id)
        const budget = project.constructionBudget + project.contingencyBudget
        const actual = actualSpend(items, exp, sels, cos)
        const committed = committedSpend(items, cos, exp)
        const pending = pendingExposure(cos, exp)
        const projected = actual + committed + pending
        const remaining = budget - projected
        const usedPct = budget > 0 ? Math.round((projected / budget) * 100) : 0
        return { project, budget, actual, committed, pending, projected, remaining, usedPct, tone: tone(projected, budget) }
      })
      .sort((a, b) => b.budget - a.budget)
  }, [projects, lineItems, expenses, changeOrders, allowances])

  const totals = useMemo(() => {
    const budget = rolls.reduce((n, r) => n + r.budget, 0)
    const projected = rolls.reduce((n, r) => n + r.projected, 0)
    const actual = rolls.reduce((n, r) => n + r.actual, 0)
    return { budget, projected, actual, remaining: budget - projected, usedPct: budget > 0 ? Math.round((projected / budget) * 100) : 0 }
  }, [rolls])

  const open = (id: string) => {
    setProjectId(id)
    navigate('/')
  }

  return (
    <section>
      <ScreenHeader title="Portfolio" subtitle="Budget and spend across all your projects" />
      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={projects.length === 0}
        errorLabel="Couldn’t load your projects"
        empty={
          <EmptyState
            icon={FolderKanban}
            title="No projects yet"
            body="Create a project to see portfolio-wide budget and spend here."
          />
        }
      >
        <SectionCard
          title="All projects"
          trailing={<strong className={totals.remaining < 0 ? 'danger-text' : undefined}>{fmt(totals.projected)}</strong>}
          footnote={`${rolls.length} project${rolls.length === 1 ? '' : 's'} · ${totals.usedPct}% of ${fmt(totals.budget)} budget`}
        >
          <div className="metric-grid">
            <div className="kv-row"><span className="muted">Total budget</span><strong>{fmt(totals.budget)}</strong></div>
            <div className="kv-row"><span className="muted">Actual spend</span><strong>{fmt(totals.actual)}</strong></div>
            <div className="kv-row"><span className="muted">Projected</span><strong>{fmt(totals.projected)}</strong></div>
            <div className="kv-row">
              <span className="muted">Remaining</span>
              <strong className={totals.remaining < 0 ? 'danger-text' : undefined}>{fmt(totals.remaining)}</strong>
            </div>
          </div>
        </SectionCard>

        <ul className="card-list">
          {rolls.map((r) => (
            <li key={r.project.id} className="expense-row">
              <button className="expense-row-open" onClick={() => open(r.project.id)}>
                <div className="expense-row-main">
                  <div className="row-between">
                    <strong>{r.project.name}</strong>
                    <Badge tone={r.tone}>{r.usedPct}%</Badge>
                  </div>
                  <div className="progress thin">
                    <span
                      className={r.tone === 'danger' ? 'fill-danger' : r.tone === 'warn' ? 'fill-nearLimit' : 'fill-brand'}
                      style={{ width: `${Math.min(100, r.usedPct)}%` }}
                    />
                  </div>
                  <span className="muted">
                    {fmt(r.projected)} projected / {fmt(r.budget)} budget · {fmt(r.remaining)} remaining
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted">
          <PieChart size={13} aria-hidden style={{ verticalAlign: '-2px' }} /> Tap a project to switch to it.
        </p>
      </ListState>
    </section>
  )
}
