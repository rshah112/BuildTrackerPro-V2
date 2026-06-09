import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
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
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { Skeleton } from '../../components/ui/Feedback'
import { Stat, TrendDelta } from '../../components/ui/Stat'
import { SectionCard } from '../../components/ui/SectionCard'
import { Donut } from '../../components/charts/Donut'
import { BarRow } from '../../components/charts/BarRow'
import { Sparkline } from '../../components/charts/Sparkline'
import { fmtDate } from '../../lib/date'
import { useLineItems } from '../budget/useBudget'
import { useCurrentProject } from '../projects/currentProject'
import { useProjects } from '../projects/useProjects'
import { useExpenses } from '../expenses/useExpenses'
import { usePhotos } from '../photos/usePhotos'
import { PhotoThumb } from '../photos/PhotoThumb'
import { usePhases } from '../phases/usePhases'
import { phaseProgress, sortPhases, clampPct } from '../phases/phaseMath'
import { localToday, nextFourteenDaysDue, cashFlowPayments } from '../cashflow/cashFlow'
import { useDashboardPrefs, DASHBOARD_SECTIONS } from './dashboardPrefs'

type Tone = 'brand' | 'warn' | 'danger'
function healthTone(used: number, limit: number): Tone {
  if (limit > 0 && used > limit) return 'danger'
  if (limit > 0 && used / limit >= 0.9) return 'warn'
  return 'brand'
}

export function DashboardScreen() {
  const { projectId } = useCurrentProject()
  const { data: projects = [], isLoading: projectsLoading, error: projectsError } = useProjects()
  const { data: lineItems = [], isLoading: itemsLoading, error: itemsError } = useLineItems(projectId!)
  const { data: expenses = [], isLoading: expensesLoading, error: expensesError } = useExpenses(projectId!)
  const { data: changeOrders = [], isLoading: ordersLoading, error: ordersError } = useRows<ChangeOrder>(
    'change_orders',
    { projectId },
  )
  const {
    data: allowanceSelections = [],
    isLoading: selectionsLoading,
    error: selectionsError,
  } = useRows<AllowanceSelection>('allowance_selections', { projectId })
  const { data: photos = [] } = usePhotos(projectId!)
  const { data: phases = [] } = usePhases(projectId!)
  const { prefs, toggle } = useDashboardPrefs()
  const [customizing, setCustomizing] = useState(false)

  // All derived figures in one memo so they don't recompute on unrelated re-renders
  // (react-query returns stable array refs between refetches, so this is effective).
  const view = useMemo(() => {
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

    // Spend logged in the trailing 7 days — a momentum read on the Actual spend KPI.
    const today = localToday()
    const [ty, tm, td] = today.split('-').map(Number)
    const wa = new Date(ty, tm - 1, td - 7)
    const weekAgo = `${wa.getFullYear()}-${String(wa.getMonth() + 1).padStart(2, '0')}-${String(wa.getDate()).padStart(2, '0')}`
    const spendThisWeek = sumBy(
      expenses.filter((e) => e.date.slice(0, 10) > weekAgo),
      (e) => e.amount,
    )

    // --- Estimated Final Cost (EAC): spent + committed + still-to-spend BASE budget + pending COs ---
    // Estimate-to-complete is the unspent BASE-budget scope; contingency is a separate reserve
    // shown in the burn-down below, not "still to spend". Anchoring BOTH the estimate and the
    // comparison to baseBudget means an on-plan project reads ~$0 (instead of the old bug, which
    // measured "still to spend" against the base but compared against base+contingency and so
    // reported a healthy project as ~the whole contingency "under budget"). Change-order/overrun
    // exposure is what now shows as "over" — which the contingency reserve below is there to absorb.
    const uncommittedRemaining = Math.max(0, baseBudget - actual - committed)
    const estimatedFinalCost = actual + committed + uncommittedRemaining + pending
    const eacVsBudget = estimatedFinalCost - baseBudget // + = projected over base, − = under

    // --- Contingency burn-down: how much of the contingency the overage has eaten ---
    const contingency = project?.contingencyBudget ?? 0
    const overBase = Math.max(0, actual + committed - baseBudget) // spend past the base budget
    const contingencyUsed = Math.min(contingency, overBase)
    const contingencyRemaining = Math.max(0, contingency - overBase)
    const contingencyPct = contingency > 0 ? Math.round((contingencyUsed / contingency) * 100) : 0

    // --- Cost per square foot ---
    const sqft = project?.squareFootage ?? 0
    const actualPsf = sqft > 0 ? actual / sqft : 0
    const eacPsf = sqft > 0 ? estimatedFinalCost / sqft : 0

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

    return {
      project,
      budgetLimit,
      baseBudget,
      actual,
      committed,
      paid,
      pending,
      allowanceRisk,
      projected,
      remaining,
      usedPct,
      tone,
      overBudgetItems,
      nearLimitItems,
      openExpenses,
      pendingOrders,
      due14,
      recentExpenses,
      spendThisWeek,
      estimatedFinalCost,
      eacVsBudget,
      contingency,
      contingencyUsed,
      contingencyRemaining,
      contingencyPct,
      sqft,
      actualPsf,
      eacPsf,
      categoryBars,
      cumulative,
      running,
    }
  }, [projects, projectId, lineItems, expenses, changeOrders, allowanceSelections])

  if (!projectId) return null

  const loading = projectsLoading || itemsLoading || expensesLoading || ordersLoading || selectionsLoading
  const error = projectsError || itemsError || expensesError || ordersError || selectionsError
  if (error && !loading) {
    return (
      <section>
        <ScreenHeader title="Dashboard" />
        <p role="alert" className="error-banner">
          Couldn’t load the dashboard: {(error as Error).message}
        </p>
      </section>
    )
  }
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

  const {
    project,
    budgetLimit,
    baseBudget,
    actual,
    committed,
    paid,
    pending,
    allowanceRisk,
    projected,
    remaining,
    usedPct,
    tone,
    overBudgetItems,
    nearLimitItems,
    openExpenses,
    pendingOrders,
    due14,
    recentExpenses,
    spendThisWeek,
    estimatedFinalCost,
    eacVsBudget,
    contingency,
    contingencyUsed,
    contingencyRemaining,
    contingencyPct,
    sqft,
    actualPsf,
    eacPsf,
    categoryBars,
    cumulative,
    running,
  } = view

  const upcoming = cashFlowPayments(expenses, changeOrders, localToday()).slice(0, 5)
  const recentPhotos = [...photos]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 6)
  const phaseStats = phaseProgress(phases)
  const phaseList = sortPhases(phases).slice(0, 6)

  return (
    <section className="dashboard">
      <ScreenHeader
        title={project?.name || 'Dashboard'}
        subtitle={project?.address || undefined}
        trailing={
          <span className="dash-header-actions">
            <Badge tone="neutral">{project?.status ?? 'active'}</Badge>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<SlidersHorizontal size={15} />}
              onClick={() => setCustomizing(true)}
              aria-label="Customize dashboard"
            >
              Customize
            </Button>
          </span>
        }
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

      {prefs.metrics && (
      <div className="metric-grid">
        <Stat label="Budget" value={fmt(baseBudget)} sub={`${fmt(project?.contingencyBudget ?? 0)} contingency`} />
        <Stat
          label="Actual spend"
          value={fmt(actual)}
          sub={`${fmt(paid)} cash paid`}
          delta={
            spendThisWeek > 0 ? (
              <TrendDelta value={spendThisWeek} label="this week" format={fmt} />
            ) : undefined
          }
        />
        <Stat label="Committed" value={fmt(committed)} sub={`${fmt(pending)} pending COs`} />
        <Stat
          label="Remaining"
          value={fmt(remaining)}
          sub={`${usedPct}% used`}
          tone={remaining < 0 ? 'danger' : 'default'}
        />
      </div>
      )}

      {prefs.eac && (
      <SectionCard
        title="Estimated final cost"
        trailing={
          <strong className={eacVsBudget > 0 ? 'danger-text' : undefined}>{fmt(estimatedFinalCost)}</strong>
        }
      >
        <p className="panel-lead">
          {eacVsBudget > 0
            ? `Projected ${fmt(eacVsBudget)} over budget`
            : eacVsBudget < 0
              ? `Projected ${fmt(Math.abs(eacVsBudget))} under budget`
              : 'Projected on budget'}
          {sqft > 0 && ` · ${fmt(eacPsf)}/sqft (${fmt(actualPsf)}/sqft spent)`}
        </p>
        {contingency > 0 && (
          <>
            <div className="kv-row">
              <span className="muted">Contingency used</span>
              <span className={contingencyPct >= 100 ? 'danger-text' : 'muted'}>
                {fmt(contingencyUsed)} / {fmt(contingency)} ({contingencyPct}%)
              </span>
            </div>
            <div className="progress thin">
              <span
                className={contingencyPct >= 90 ? 'fill-danger' : contingencyPct >= 60 ? 'fill-nearLimit' : 'fill-brand'}
                style={{ width: `${Math.min(100, contingencyPct)}%` }}
              />
            </div>
            <p className="panel-foot">{fmt(contingencyRemaining)} contingency remaining</p>
          </>
        )}
      </SectionCard>
      )}

      {prefs.phases && phases.length > 0 && (
        <SectionCard
          title="Phase Pulse"
          trailing={<strong>{phaseStats.overall}%</strong>}
          footnote={
            phaseStats.current
              ? `Now: ${phaseStats.current.name} · ${phaseStats.done}/${phaseStats.total} phases complete`
              : `${phaseStats.done}/${phaseStats.total} phases complete`
          }
        >
          <div className="barrow-list">
            {phaseList.map((p) => {
              const pct = clampPct(p.pctComplete)
              return (
                <div key={p.id} className="phase-bar">
                  <div className="row-between">
                    <span>{p.name}</span>
                    <span className="muted tnum">{pct}%</span>
                  </div>
                  <div className="progress thin">
                    <span className="fill-brand" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <Link to="/phases" className="card-link">Manage phases ›</Link>
        </SectionCard>
      )}

      {prefs.category && categoryBars.length > 0 && (
        <SectionCard title="Spend by category">
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
        </SectionCard>
      )}

      {prefs.trend && cumulative.length >= 2 && (
        <SectionCard title="Spend over time" trailing={<strong>{fmt(running)}</strong>}>
          <Sparkline values={cumulative} />
        </SectionCard>
      )}

      {prefs.upcoming && upcoming.length > 0 && (
        <SectionCard title="Upcoming payments" trailing={<strong>{fmt(due14)}</strong>}>
          <ul className="plain-list">
            {upcoming.map((p) => (
              <li key={p.id} className="kv-row">
                <span>
                  {p.title} <span className="muted">· {fmtDate(p.expectedDate)}</span>
                </span>
                <strong className="tnum">{fmt(p.amount)}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {prefs.recentPhotos && recentPhotos.length > 0 && (
        <SectionCard title="Recent photos">
          <div className="photo-grid">
            {recentPhotos.map((ph) => (
              <div key={ph.id} className="photo-cell">
                <PhotoThumb objectKey={ph.imageObjectKey} alt={ph.notes || ph.roomTag || 'Photo'} />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="two-column">
        {prefs.attention && (
        <SectionCard title="Attention">
          <ul className="stat-list">
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
            <li>
              <strong>{fmt(sumBy(expenses, (e) => e.retainageAmount ?? 0))}</strong> retainage held
            </li>
          </ul>
        </SectionCard>
        )}

        {prefs.recentExpenses && (
        <SectionCard title="Recent expenses">
          {recentExpenses.length === 0 && <p className="panel-lead">No expenses yet.</p>}
          <ul className="plain-list">
            {recentExpenses.map((e: Expense) => (
              <li key={e.id} className="kv-row">
                <span>{e.vendorName || e.categoryName || 'Expense'}</span>
                <strong className="tnum">{fmt(e.amount)}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
        )}
      </div>

      <Sheet open={customizing} onClose={() => setCustomizing(false)} title="Customize dashboard">
        <ul className="stat-list">
          {DASHBOARD_SECTIONS.map((s) => (
            <li key={s.key} className="kv-row">
              <label className="checkbox-row" style={{ margin: 0 }}>
                <input type="checkbox" checked={prefs[s.key]} onChange={() => toggle(s.key)} />
                {s.label}
              </label>
            </li>
          ))}
        </ul>
        <p className="muted">Choose which sections appear on your dashboard. Saved on this device.</p>
      </Sheet>
    </section>
  )
}
