import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SlidersHorizontal } from 'lucide-react'
import { useRows } from '../../data/hooks'
import type { AllowanceSelection, ChangeOrder, Expense, Project } from '../../domain/types'
import { allowanceOverage } from '../../lib/budgetAggregates'
import { lineItemHealth } from '../../lib/budgetMath'
import { diff, fmt, sum, sumBy } from '../../lib/money'
import { categoryFinancialSummary, projectFinancialSummary } from '../../lib/financialSummary'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { Skeleton } from '../../components/ui/Feedback'
import { TrendDelta } from '../../components/ui/Stat'
import { SummaryStrip } from '../../components/ui/SummaryStrip'
import { SectionCard } from '../../components/ui/SectionCard'
import { Donut } from '../../components/charts/Donut'
import { BarRow } from '../../components/charts/BarRow'
import { Sparkline } from '../../components/charts/Sparkline'
import { fmtDate } from '../../lib/date'
import { balanceDue, payableBalance, retainageHeld } from '../../lib/expenseMath'
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
    const financial = projectFinancialSummary({
      project: project ?? {
        constructionBudget: sumBy(lineItems, (item) => item.budget),
        contingencyBudget: 0,
      },
      lineItems,
      expenses,
      changeOrders,
      allowanceSelections,
    })
    const budgetLimit = financial.constructionLimit
    // Land is reported only in the explicitly labelled all-in figure; construction
    // performance continues to compare against the build budget and contingency.
    const landAcq = financial.landAcquisition
    const allInCost = financial.allInBudget
    const baseBudget = financial.baseBudget
    const actual = financial.actual
    const committed = financial.committed
    const paid = financial.cashPaid
    const pending = financial.pending
    const allowanceRisk = allowanceOverage(lineItems, allowanceSelections, expenses)
    const projected = financial.projected
    const remaining = financial.remaining
    const usedPct = financial.usedPct
    const tone = healthTone(projected, budgetLimit)

    const overBudgetItems = lineItems.filter((li) => lineItemHealth(li) === 'overBudget')
    const nearLimitItems = lineItems.filter((li) => lineItemHealth(li) === 'nearLimit')
    const openExpenses = expenses.filter((e) => balanceDue(e) > 0)
    const pendingOrders = changeOrders.filter((c) => c.status === 'pending')
    const due14 = nextFourteenDaysDue(expenses, changeOrders, localToday(), { includeOverdue: false })
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

    const estimatedFinalCost = financial.estimatedFinalCost
    const eacVsBudget = financial.estimatedVariance
    const contingency = financial.contingencyBudget
    const contingencyUsed = financial.contingencyUsed
    const contingencyRemaining = financial.contingencyRemaining
    const contingencyPct = financial.contingencyUsedPct

    // --- Cost per square foot ---
    const sqft = project?.squareFootage ?? 0
    const actualPsf = sqft > 0 ? actual / sqft : 0
    const eacPsf = sqft > 0 ? estimatedFinalCost / sqft : 0

    // Category view uses the same allowance-aware exposure definition as Budget.
    const categoryBars = [...new Set(lineItems.map((item) => item.categoryName))]
      .filter(Boolean)
      .map((name) => ({ name, ...categoryFinancialSummary(name, lineItems) }))
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 5)

    // Cumulative spend over time.
    const cumulative: number[] = []
    let running = 0
    for (const e of [...expenses].sort((a, b) => a.date.localeCompare(b.date))) {
      running = sum([running, e.amount])
      cumulative.push(running)
    }

    const todayForOverdue = localToday()
    const invoicedOrderIds = new Set(
      expenses.flatMap((expense) => (expense.changeOrderId ? [expense.changeOrderId] : [])),
    )
    const overdueExpenses = expenses.filter((expense) => {
      const date = expense.expectedPaymentDate ?? expense.dueDate
      return payableBalance(expense) > 0 && date != null && date.slice(0, 10) < todayForOverdue
    })
    const overdueOrders = changeOrders.filter(
      (order) =>
        order.status !== 'paid' &&
        !invoicedOrderIds.has(order.id) &&
        order.expectedPaymentDate != null &&
        order.expectedPaymentDate.slice(0, 10) < todayForOverdue,
    )
    const overdueTotal = sum([
      sumBy(overdueExpenses, payableBalance),
      sumBy(overdueOrders, (order) => order.amount),
    ])

    return {
      project,
      budgetLimit,
      landAcq,
      allInCost,
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
      overdueTotal,
      overdueCount: overdueExpenses.length + overdueOrders.length,
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
    landAcq,
    allInCost,
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
    overdueTotal,
    overdueCount,
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

  const upcoming = cashFlowPayments(expenses, changeOrders, localToday(), { includeOverdue: false }).slice(0, 5)
  const recentPhotos = [...photos]
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    .slice(0, 6)
  const phaseStats = phaseProgress(phases)
  const phaseList = sortPhases(phases).slice(0, 6)

  return (
    <section className="dashboard">
      <ScreenHeader
        title="Overview"
        subtitle={project ? [project.name, project.address].filter(Boolean).join(' · ') : undefined}
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
        <div className="hero-card-copy">
          <span className="hero-eyebrow">Financial position</span>
          <h2>Risk-adjusted project exposure</h2>
          <p>Incurred cost, open commitments, and pending change orders against the authorized build budget.</p>
        </div>
        <Donut
          value={projected}
          max={budgetLimit}
          tone={tone}
          label={`${usedPct}%`}
          sublabel="of authorized"
        />
        <div className="hero-figures">
          <div className="hero-figure">
            <span className="muted">Projected exposure</span>
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
          {landAcq > 0 && (
            <div className="hero-figure">
              <span className="muted">All-in (incl. land)</span>
              <strong>{fmt(allInCost)}</strong>
            </div>
          )}
        </div>
      </div>

      {prefs.metrics && (
        <SummaryStrip
          label="Project financial summary"
          metrics={[
            { label: 'Base budget', value: fmt(baseBudget), detail: `${fmt(contingency)} contingency reserve` },
            {
              label: 'Incurred cost',
              value: fmt(actual),
              detail: spendThisWeek > 0 ? <TrendDelta value={spendThisWeek} label="in the last 7 days" format={fmt} /> : 'No spend in the last 7 days',
            },
            { label: 'Cash paid', value: fmt(paid), detail: `${fmt(Math.max(0, diff(actual, paid)))} incurred, not yet paid`, tone: 'success' },
            { label: 'Open commitments', value: fmt(committed), detail: `${fmt(pending)} pending CO exposure` },
            { label: 'Remaining', value: fmt(remaining), detail: `${usedPct}% of authorized budget used`, tone: remaining < 0 ? 'danger' : usedPct >= 90 ? 'warn' : 'success' },
          ]}
        />
      )}

      <div className="dashboard-grid">
      {prefs.eac && (
      <SectionCard
        className="dash-span-4"
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
          className="dash-span-8"
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
        <SectionCard className="dash-span-8" title="Budget exposure by category" trailing={<Link to="/budget" className="card-link inline-link">View budget ›</Link>}>
          <div className="barrow-list">
            {categoryBars.map((c) => (
              <BarRow
                key={c.name}
                label={c.name}
                value={c.exposure}
                max={c.effectiveBudget || c.exposure}
                valueText={`${fmt(c.exposure)} / ${fmt(c.effectiveBudget)}`}
                tone={c.status === 'overBudget' ? 'danger' : c.status === 'nearLimit' ? 'warn' : 'brand'}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {prefs.trend && cumulative.length >= 2 && (
        <SectionCard className="dash-span-4" title="Invoiced spend over time" trailing={<strong>{fmt(running)}</strong>}>
          <Sparkline
            values={cumulative}
            ariaLabel={`Cumulative invoiced spend increased from ${fmt(cumulative[0])} to ${fmt(cumulative[cumulative.length - 1])}`}
          />
          <p className="panel-foot">Cumulative invoice amounts, ordered by transaction date.</p>
        </SectionCard>
      )}

      {prefs.upcoming && upcoming.length > 0 && (
        <SectionCard className="dash-span-5" title="Upcoming payments" trailing={<Link to="/cashflow" className="card-link inline-link">{fmt(due14)} ›</Link>}>
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
        <SectionCard className="dash-span-6" title="Recent photos" trailing={<Link to="/photos" className="card-link inline-link">View all ›</Link>}>
          <div className="photo-grid">
            {recentPhotos.map((ph) => (
              <div key={ph.id} className="photo-cell">
                <PhotoThumb objectKey={ph.imageObjectKey} alt={ph.notes || ph.roomTag || 'Photo'} />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

        {prefs.attention && (
        <SectionCard className="dash-span-7" title="Attention" trailing={<Badge tone={overdueCount > 0 || overBudgetItems.length > 0 ? 'danger' : 'neutral'}>{overdueCount + overBudgetItems.length + pendingOrders.length} priority</Badge>}>
          <ul className="attention-list">
            {overdueCount > 0 && (
              <li><Link to="/cashflow"><span><Badge tone="danger">Overdue</Badge><strong>{overdueCount} payment{overdueCount === 1 ? '' : 's'} need attention</strong><small>{fmt(overdueTotal)} payable past due</small></span><span aria-hidden>›</span></Link></li>
            )}
            {overBudgetItems.length > 0 && (
              <li><Link to="/budget"><span><Badge tone="danger">Over budget</Badge><strong>{overBudgetItems.length} line item{overBudgetItems.length === 1 ? '' : 's'} exceed budget</strong><small>Review exposure and remaining scope</small></span><span aria-hidden>›</span></Link></li>
            )}
            {nearLimitItems.length > 0 && (
              <li><Link to="/budget"><span><Badge tone="warn">Near limit</Badge><strong>{nearLimitItems.length} line item{nearLimitItems.length === 1 ? '' : 's'} at 90% or more</strong><small>Commitments are included in this risk check</small></span><span aria-hidden>›</span></Link></li>
            )}
            {pendingOrders.length > 0 && (
              <li><Link to="/change-orders"><span><Badge tone="warn">Pending</Badge><strong>{pendingOrders.length} change order{pendingOrders.length === 1 ? '' : 's'} awaiting decision</strong><small>{fmt(pending)} potential budget exposure</small></span><span aria-hidden>›</span></Link></li>
            )}
            {allowanceRisk > 0 && (
              <li><Link to="/allowances"><span><Badge tone="warn">Allowances</Badge><strong>{fmt(allowanceRisk)} total overage</strong><small>Compare selections with allowance limits</small></span><span aria-hidden>›</span></Link></li>
            )}
            {overdueCount === 0 && overBudgetItems.length === 0 && nearLimitItems.length === 0 && pendingOrders.length === 0 && allowanceRisk === 0 && (
              <li className="attention-clear"><span><Badge tone="success">On track</Badge><strong>No immediate financial risks</strong><small>{openExpenses.length} open expense{openExpenses.length === 1 ? '' : 's'} · {fmt(due14)} due in 14 days · {fmt(sumBy(expenses, retainageHeld))} retainage held</small></span></li>
            )}
          </ul>
        </SectionCard>
        )}

        {prefs.recentExpenses && (
        <SectionCard className="dash-span-6" title="Recent expenses" trailing={<Link to="/expenses" className="card-link inline-link">View all ›</Link>}>
          {recentExpenses.length === 0 && <p className="panel-lead">No expenses yet.</p>}
          <ul className="plain-list dashboard-expense-list">
            {recentExpenses.map((e: Expense) => (
              <li key={e.id}>
                <Link to="/expenses" className="dashboard-expense-row">
                  <span className="dashboard-expense-copy">
                    <strong className="dashboard-expense-vendor">
                      {e.vendorName || e.categoryName || 'Expense'}
                    </strong>
                    <small className="dashboard-expense-meta">
                      {fmtDate(e.date)} · {e.categoryName || 'Uncategorized'}
                    </small>
                  </span>
                  <strong className="dashboard-expense-amount tnum">{fmt(e.amount)}</strong>
                </Link>
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
