import { CalendarClock } from 'lucide-react'
import { fmt } from '../../lib/money'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/Feedback'
import { useCurrentProject } from '../projects/currentProject'
import { useExpenses } from '../expenses/useExpenses'
import { useChangeOrders } from '../changeOrders/useChangeOrders'
import { cashFlowForecast, nextFourteenDaysDue } from './cashFlow'

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

  const today = new Date().toISOString()
  const days = cashFlowForecast(expenses, changeOrders, today).filter((d) => d.payments.length > 0)
  const total = nextFourteenDaysDue(expenses, changeOrders, today)

  return (
    <section>
      <ScreenHeader title="Cash flow" subtitle="Next 14 days of expected payments" />

      <div className="hero-card" style={{ gap: '1rem' }}>
        <div className="hero-figures">
          <div className="hero-figure">
            <span className="muted">Due in the next 14 days</span>
            <strong style={{ fontSize: 'var(--text-3xl)' }}>{fmt(total)}</strong>
          </div>
        </div>
      </div>

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
