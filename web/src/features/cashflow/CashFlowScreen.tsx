import { CalendarClock } from 'lucide-react'
import { fmt, sumBy } from '../../lib/money'
import { payableBalance } from '../../lib/expenseMath'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge } from '../../components/ui/Badge'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { Stat } from '../../components/ui/Stat'
import { SectionCard } from '../../components/ui/SectionCard'
import { useCurrentProject } from '../projects/currentProject'
import { useExpenses } from '../expenses/useExpenses'
import { useChangeOrders } from '../changeOrders/useChangeOrders'
import { cashFlowForecast, localToday, nextFourteenDaysDue } from './cashFlow'
import { fmtDate } from '../../lib/date'

const fmtDay = (iso: string) => fmtDate(iso, { weekday: 'short', month: 'short', day: 'numeric' })

export function CashFlowScreen() {
  const { projectId } = useCurrentProject()
  const { data: expenses = [], isLoading: expensesLoading, error: expensesError } = useExpenses(projectId!)
  const { data: changeOrders = [], isLoading: ordersLoading, error: ordersError } = useChangeOrders(projectId!)

  if (!projectId) return null
  const error = expensesError ?? ordersError
  if (error)
    return (
      <p role="alert" className="error-banner">
        Couldn’t load cash flow: {(error as Error).message}
      </p>
    )
  if (expensesLoading || ordersLoading) return <ListSkeleton />


  const today = localToday()
  // Overdue items are shown in their own card below, so EXCLUDE them here (don't clamp them
  // forward into the 14-day window) — otherwise the same dollars appear in both "Overdue" and
  // "Due next 14 days", and again in today's forecast card.
  const days = cashFlowForecast(expenses, changeOrders, today, { includeOverdue: false }).filter(
    (d) => d.payments.length > 0,
  )
  const total = nextFourteenDaysDue(expenses, changeOrders, today, { includeOverdue: false })

  // Overdue: still-owing items whose date is already in the past (outside the forward window).
  const overdueExpenses = expenses.filter((e) => {
    const due = e.expectedPaymentDate ?? e.dueDate
    return payableBalance(e) > 0 && due != null && due.slice(0, 10) < today
  })
  const invoicedOrderIds = new Set(expenses.flatMap((expense) => (expense.changeOrderId ? [expense.changeOrderId] : [])))
  const overdueOrders = changeOrders.filter(
    (c) =>
      c.status !== 'paid' &&
      !invoicedOrderIds.has(c.id) &&
      c.expectedPaymentDate != null &&
      c.expectedPaymentDate.slice(0, 10) < today,
  )
  const overdueTotal =
    sumBy(overdueExpenses, payableBalance) + sumBy(overdueOrders, (c) => c.amount)
  const hasOverdue = overdueExpenses.length + overdueOrders.length > 0

  return (
    <section>
      <ScreenHeader title="Cash flow" subtitle="Upcoming and overdue payments" />

      <div className="metric-grid compact">
        <Stat label="Due next 14 days" value={fmt(total)} />
        <Stat label="Overdue" value={fmt(overdueTotal)} tone={overdueTotal > 0 ? 'danger' : 'default'} />
      </div>

      {hasOverdue && (
        <SectionCard tone="danger" title="Overdue" trailing={<span className="danger-text">{fmt(overdueTotal)}</span>}>
          <ul className="plain-list">
            {overdueExpenses.map((e) => (
              <li key={e.id} className="cashflow-pay">
                <div className="expense-row-main">
                  <strong>{e.vendorName || 'Expense'}</strong>
                  <span className="muted">
                    Due {fmtDay((e.expectedPaymentDate ?? e.dueDate)!.slice(0, 10))}
                    {e.categoryName ? ` · ${e.categoryName}` : ''}
                  </span>
                </div>
                <strong>{fmt(payableBalance(e))}</strong>
              </li>
            ))}
            {overdueOrders.map((c) => (
              <li key={c.id} className="cashflow-pay">
                <div className="expense-row-main">
                  <strong>{c.title || 'Change order'}</strong>
                  <span className="muted">Due {fmtDay(c.expectedPaymentDate!.slice(0, 10))} · {c.status}</span>
                </div>
                <strong>{fmt(c.amount)}</strong>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {days.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing due in the next 14 days"
          body="Unpaid expenses with a due date, and change orders with an expected payment date, show up here."
        />
      ) : (
        <div className="cashflow-days">
          {days.map((d) => (
            <SectionCard key={d.date} title={fmtDay(d.date)} trailing={<strong>{fmt(d.total)}</strong>}>
              <ul className="plain-list">
                {d.payments.map((p) => (
                  <li key={p.id} className="cashflow-pay">
                    <div className="expense-row-main">
                      <strong>{p.title}</strong>
                      <span className="muted">{p.subtitle}</span>
                    </div>
                    <div className="expense-row-amount">
                      <Badge tone={p.exposure === 'pending' ? 'warn' : 'info'}>{p.exposure}</Badge>
                      <strong>{fmt(p.amount)}</strong>
                    </div>
                  </li>
                ))}
              </ul>
            </SectionCard>
          ))}
        </div>
      )}
    </section>
  )
}
