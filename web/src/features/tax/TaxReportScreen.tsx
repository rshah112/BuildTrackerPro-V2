import { useMemo, useState } from 'react'
import { Calculator } from 'lucide-react'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Stat } from '../../components/ui/Stat'
import { SectionCard } from '../../components/ui/SectionCard'
import { Badge } from '../../components/ui/Badge'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { fmt } from '../../lib/money'
import { useCurrentProject } from '../projects/currentProject'
import { useExpenses } from '../expenses/useExpenses'
import { useVendors } from '../vendors/useVendors'
import { findVendorByName } from '../vendors/useEnsureVendor'
import { vendor1099Rollup, REPORTABLE_THRESHOLD } from './tax1099'

const YEARS: number[] = (() => {
  const y = new Date().getFullYear()
  return [y, y - 1, y - 2, y - 3]
})()

export function TaxReportScreen() {
  const { projectId } = useCurrentProject()
  const { data: expenses = [], isLoading, error } = useExpenses(projectId!)
  const { data: vendors = [] } = useVendors(projectId!)
  const [year, setYear] = useState(YEARS[0])
  const rows = useMemo(() => vendor1099Rollup(expenses, year), [expenses, year])

  if (!projectId) return null

  const reportable = rows.filter((r) => r.reportable)
  const reportableTotal = reportable.reduce((s, r) => s + r.paid, 0)

  return (
    <section>
      <ScreenHeader title="Tax / 1099 prep" subtitle="Cash-basis vendor payments by year" />

      <Field label="Tax year">
        {(p) => (
          <Select {...p} value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="metric-grid compact">
        <Stat label={`Vendors ≥ ${fmt(REPORTABLE_THRESHOLD)}`} value={String(reportable.length)} />
        <Stat label="Reportable total" value={fmt(reportableTotal)} />
      </div>

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={rows.length === 0}
        errorLabel="Couldn’t load expenses"
        empty={
          <EmptyState
            icon={Calculator}
            title={`No vendor payments in ${year}`}
            body="Paid expenses with a paid date in this year show up here, grouped by vendor."
          />
        }
      >
        <SectionCard
          title={`Paid to vendors in ${year}`}
          footnote={`Payments of ${fmt(REPORTABLE_THRESHOLD)}+ to an unincorporated vendor are generally 1099-NEC reportable — collect a W-9 from each flagged vendor. Cash-basis, by paid date.`}
        >
          <ul className="plain-list">
            {rows.map((r) => {
              const hasW9 = !!findVendorByName(vendors, r.vendor)?.taxId
              return (
                <li key={r.vendor} className="kv-row">
                  <span>
                    {r.vendor}{' '}
                    <span className="muted">
                      · {r.count} payment{r.count === 1 ? '' : 's'}
                      {r.reportable ? (hasW9 ? ' · W-9 ✓' : ' · W-9 needed') : ''}
                    </span>
                  </span>
                  <span className="expense-row-amount">
                    {r.reportable && <Badge tone={hasW9 ? 'success' : 'warn'}>1099</Badge>}
                    <strong className="tnum">{fmt(r.paid)}</strong>
                  </span>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      </ListState>
    </section>
  )
}
