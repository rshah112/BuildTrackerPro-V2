import { useMemo, useState } from 'react'
import { Calculator } from 'lucide-react'
import type { Expense, Project, Vendor } from '../../domain/types'
import { useRows } from '../../data/hooks'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Stat } from '../../components/ui/Stat'
import { SectionCard } from '../../components/ui/SectionCard'
import { Badge } from '../../components/ui/Badge'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { fmt, sumBy } from '../../lib/money'
import { candidateThresholdForYear, vendor1099Rollup } from './tax1099'

const YEARS: number[] = (() => {
  const year = new Date().getFullYear()
  return [year, year - 1, year - 2, year - 3]
})()

export function TaxReportScreen() {
  const projectsQuery = useRows<Project>('projects')
  const expensesQuery = useRows<Expense>('expenses')
  const vendorsQuery = useRows<Vendor>('vendors')
  const [year, setYear] = useState(YEARS[0])

  const rows = useMemo(() => {
    const projects = projectsQuery.data ?? []
    const expenses = expensesQuery.data ?? []
    const vendors = vendorsQuery.data ?? []
    const activeProjectIds = new Set(projects.map((project) => project.id))
    return vendor1099Rollup(
      expenses.filter((expense) => activeProjectIds.has(expense.projectId)),
      year,
      vendors.filter((vendor) => activeProjectIds.has(vendor.projectId)),
    )
  }, [projectsQuery.data, expensesQuery.data, vendorsQuery.data, year])

  const threshold = candidateThresholdForYear(year)
  const candidates = rows.filter((row) => row.candidate)
  const candidateTotal = sumBy(candidates, (row) => row.eligiblePaid)
  const excludedTotal = sumBy(rows, (row) => row.excludedNetworkPaid)
  const isLoading = projectsQuery.isLoading || expensesQuery.isLoading || vendorsQuery.isLoading
  const error = projectsQuery.error ?? expensesQuery.error ?? vendorsQuery.error

  return (
    <section>
      <ScreenHeader title="Tax / 1099 prep" subtitle="Portfolio-wide payment candidates for review" />

      <Field label="Tax year">
        {(props) => (
          <Select {...props} value={String(year)} onChange={(event) => setYear(Number(event.target.value))}>
            {YEARS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <div className="metric-grid compact">
        <Stat label={`Candidates ≥ ${fmt(threshold)}`} value={String(candidates.length)} />
        <Stat label="Candidate payments" value={fmt(candidateTotal)} />
        <Stat label="Card / network excluded" value={fmt(excludedTotal)} />
      </div>

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={rows.length === 0}
        errorLabel="Couldn’t load portfolio payments"
        empty={
          <EmptyState
            icon={Calculator}
            title={`No vendor payments in ${year}`}
            body="Paid expenses across your active projects show up here, grouped for tax review."
          />
        }
      >
        <SectionCard
          title={`Vendor payment review · ${year}`}
          footnote={`Potential candidates only, not a filing determination. The ${year} review threshold shown is ${fmt(threshold)}. Card and recognized payment-network amounts are excluded; confirm vendor entity type, exemptions, payment purpose, W-9 details, and future-year inflation adjustments with your tax professional.`}
        >
          <ul className="plain-list">
            {rows.map((row) => (
              <li key={row.key} className="kv-row">
                <span>
                  {row.vendor}{' '}
                  <span className="muted">
                    · {row.paymentCount} eligible payment{row.paymentCount === 1 ? '' : 's'}
                    {row.excludedNetworkCount > 0 ? ` · ${fmt(row.excludedNetworkPaid)} card/network excluded` : ''}
                    {row.missingPaidDateCount > 0 ? ` · ${row.missingPaidDateCount} paid date${row.missingPaidDateCount === 1 ? '' : 's'} to verify` : ''}
                    {row.partialPaymentCount > 0 ? ` · ${row.partialPaymentCount} partial payment allocation${row.partialPaymentCount === 1 ? '' : 's'} to verify` : ''}
                    {row.candidate ? (row.hasTaxId ? ' · tax ID present' : ' · tax details to review') : ''}
                  </span>
                </span>
                <span className="expense-row-amount">
                  {row.candidate && <Badge tone={row.hasTaxId ? 'info' : 'warn'}>Review</Badge>}
                  <strong className="tnum">{fmt(row.eligiblePaid)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </ListState>
    </section>
  )
}
