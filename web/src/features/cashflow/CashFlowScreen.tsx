import { CalendarClock } from 'lucide-react'
import { fmt, sumBy } from '../../lib/money'
import { balanceDue } from '../../lib/expenseMath'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/Feedback'
import { useCurrentProject } from '../projects/currentProject'
import { useExpenses } from '../expenses/useExpenses'
import { useChangeOrders } from '../changeOrders/useChangeOrders'
import { cashFlowForecast, localToday, nextFourteenDaysDue } from './cashFlow'

const fmtDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function CashFlowScreen() {
  const { projectId } = useCurrentProject()
  const { data: expenses = [], isLoading } = useExpenses(projectId!)
  const { data: changeOrders = [] } = useChangeOrders(projectId!)

  if (!projectId) return null
  if (isLoading) return <div className="loading">Loading cash flow…</div>

  const today = localToday()
  const days = cashFlowForecast(expenses, changeOrders, today).filter((d) => d.payments.length > 0)
  const total = nextFourteenDaysDue(expenses, changeOrders, today)

  // Overdue: still-owing items whose date is already in the past (outside the forward window).
  const overdueExpenses = expenses.filter((e) => {
    const due = e.expectedPaymentDate ?? e.dueDate
    return balanceDue(e) > 0 && due != null && due.slice(0, 10) < today
  })
  const overdueOrders = changeOrders.filter(
    (c) => c.status !== 'paid' && c.expectedPaymentDate != null && c.expectedPaymentDate.slice(0, 10) < today,
  )
  const overdueTotal =
    sumBy(overdueExpenses, (e) => balanceDue(e)) + sumBy(overdueOrders, (c) => c.amount)
  const hasOverdue = overdueExpenses.length + overdueOrders.length > 0

  return (
    <section>
      <ScreenHeader title="Cash flow" subtitle="Upcoming and overdue payments" />

      <div className="metric-grid compact">
        <div className="metric-card">
          <span>Due next 14 days</span>
          <strong>{fmt(total)}</strong>
        </div>
        <div className="metric-card">
          <span>Overdue</span>
          <strong className={overdueTotal > 0 ? 'danger-text' : undefined}>{fmt(overdueTotal)}</strong>
        </div>
      </div>

      {hasOverdue && (
        <div className="panel" style={{ marginTop: '1rem', borderColor: 'var(--color-danger)' }}>
          <div className="row-between">
            <h2 className="danger-text">Overdue</h2>
            <strong className="danger-text">{fmt(overdueTotal)}</strong>
          </div>
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
                <strong>{fmt(balanceDue(e))}</strong>
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
        </div>
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
            <div key={d.date} className="panel">
              <div className="row-between">
                <h2>{fmtDay(d.date)}</h2>
                <strong>{fmt(d.total)}</strong>
              </div>
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
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
