import { useMemo, useState } from 'react'
import { Plus, Trash2, Contact, Phone, Mail } from 'lucide-react'
import type { Bid, ProjectTask, Vendor } from '../../domain/types'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { SearchField } from '../../components/ui/SearchField'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Stat } from '../../components/ui/Stat'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useRestoreRow, useRows } from '../../data/hooks'
import { useExpenses } from '../expenses/useExpenses'
import { fmt } from '../../lib/money'
import { matchesQuery } from '../../lib/search'
import {
  vendorOperationRows,
  vendorOperationSummary,
  type VendorOperationRow,
} from '../operations/operationsSummary'
import { useVendors, useRemoveVendor } from './useVendors'
import { VendorForm } from './VendorForm'
import { VendorDetailSheet } from './VendorDetailSheet'
import '../operations/operations.css'

type Filter = 'all' | 'open' | 'insurance'

const EMPTY_ROWS: never[] = []
const INSURANCE_LABEL = {
  none: 'COI not tracked',
  ok: 'COI current',
  expiring: 'COI expiring',
  expired: 'COI expired',
} as const
const INSURANCE_TONE: Record<VendorOperationRow['insurance'], BadgeTone> = {
  none: 'neutral',
  ok: 'success',
  expiring: 'warn',
  expired: 'danger',
}

export function VendorsScreen() {
  const { projectId } = useCurrentProject()
  const vendorsQuery = useVendors(projectId!)
  const expensesQuery = useExpenses(projectId!)
  const bidsQuery = useRows<Bid>('bids', { projectId })
  const tasksQuery = useRows<ProjectTask>('project_tasks', { projectId })
  const vendors = vendorsQuery.data ?? EMPTY_ROWS
  const expenses = expensesQuery.data ?? EMPTY_ROWS
  const bids = bidsQuery.data ?? EMPTY_ROWS
  const tasks = tasksQuery.data ?? EMPTY_ROWS
  const queries = [vendorsQuery, expensesQuery, bidsQuery, tasksQuery]
  const isLoading = queries.some((query) => query.isLoading)
  const error = queries.find((query) => query.error)?.error
  const remove = useRemoveVendor()
  const restore = useRestoreRow('vendors')
  const toast = useToast()
  const editor = useEditor<Vendor>()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [profile, setProfile] = useState<Vendor | null>(null)

  const rows = useMemo(
    () => vendorOperationRows(vendors, expenses, bids, tasks),
    [vendors, expenses, bids, tasks],
  )
  const summary = useMemo(() => vendorOperationSummary(rows), [rows])
  const visible = useMemo(
    () =>
      rows.filter((row) => {
        const filterMatch =
          filter === 'all' ||
          (filter === 'open' && row.rollup.open > 0) ||
          (filter === 'insurance' && (row.insurance === 'expired' || row.insurance === 'expiring'))
        return (
          filterMatch &&
          matchesQuery(
            q,
            row.vendor.name,
            row.vendor.trade,
            row.vendor.phone,
            row.vendor.email,
            row.vendor.notes,
          )
        )
      }),
    [rows, filter, q],
  )

  if (!projectId) return null

  const del = async (vendor: Vendor) => {
    await remove.mutateAsync(vendor.id)
    toast.success('Vendor moved to Trash', {
      action: { label: 'Undo', onClick: () => restore.mutate(vendor.id) },
    })
  }
  const resetView = () => {
    setQ('')
    setFilter('all')
  }

  return (
    <section className="operations-screen">
      <ScreenHeader
        title="Vendors"
        subtitle="Contacts, compliance and project payment activity"
        trailing={
          vendors.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add vendor
            </Button>
          ) : undefined
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={vendors.length === 0}
        errorLabel="Couldn’t load vendor overview"
        empty={
          <EmptyState
            icon={Contact}
            title="No vendors yet"
            body="Keep your subs and suppliers — trade, phone, email and project activity — in one place."
            action={
              <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add vendor
              </Button>
            }
          />
        }
      >
        <>
          <div className="metric-grid operations-summary" aria-label="Vendor payment summary">
            <Stat
              label="Vendors"
              value={String(summary.vendorCount)}
              sub={`${summary.openVendorCount} open balance · ${summary.insuranceAttentionCount} COI attention`}
            />
            <Stat label="Invoiced" value={fmt(summary.invoiced)} sub="Linked vendor expenses" />
            <Stat label="Paid" value={fmt(summary.paid)} sub="Recorded payments" />
            <Stat
              label="Open"
              value={fmt(summary.open)}
              sub="Outstanding balance"
              tone={summary.open > 0 ? 'danger' : 'default'}
            />
          </div>

          <div className="operations-toolbar">
            <SearchField value={q} onChange={setQ} placeholder="Search vendor, trade, phone or email" />
            <div className="operations-filter">
              <SegmentedControl<Filter>
                ariaLabel="Filter vendors"
                value={filter}
                onChange={setFilter}
                segments={[
                  { value: 'all', label: `All (${rows.length})` },
                  { value: 'open', label: `Open (${summary.openVendorCount})` },
                  { value: 'insurance', label: `COI (${summary.insuranceAttentionCount})` },
                ]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={Contact}
              title="No vendors match this view"
              body="Clear the search or show all vendors to return to the full directory."
              action={<Button variant="secondary" onClick={resetView}>Clear filters</Button>}
            />
          ) : (
            <ul className="operations-list">
              {visible.map(({ vendor, rollup, insurance }) => (
                <li key={vendor.id}>
                  <article className="operations-record">
                    <button
                      type="button"
                      className="operations-record-open"
                      onClick={() => setProfile(vendor)}
                      aria-label={`Open ${vendor.name} details`}
                    >
                      <span className="operations-record-title">
                        <strong>{vendor.name}</strong>
                        <span className="operations-record-meta">
                          {vendor.trade || 'Vendor'}
                          {vendor.phone ? ` · ${vendor.phone}` : ''}
                          {vendor.email ? ` · ${vendor.email}` : ''}
                        </span>
                      </span>
                      <span className="operations-record-badges">
                        {rollup.open > 0 && <Badge tone="warn">{fmt(rollup.open)} open</Badge>}
                        {insurance !== 'none' && (
                          <Badge tone={INSURANCE_TONE[insurance]}>{INSURANCE_LABEL[insurance]}</Badge>
                        )}
                      </span>
                    </button>

                    <dl className="operations-impact-grid" aria-label={`${vendor.name} payment activity`}>
                      <div>
                        <dt>Invoiced</dt>
                        <dd>{fmt(rollup.invoiced)}</dd>
                      </div>
                      <div>
                        <dt>Paid</dt>
                        <dd className={rollup.paid > 0 ? 'operations-money-success' : undefined}>{fmt(rollup.paid)}</dd>
                      </div>
                      <div>
                        <dt>Open</dt>
                        <dd className={rollup.open > 0 ? 'operations-money-danger' : undefined}>{fmt(rollup.open)}</dd>
                      </div>
                    </dl>

                    <div className="operations-record-actions" aria-label={`${vendor.name} actions`}>
                      {vendor.phone && (
                        <a className="btn btn-secondary btn-sm" href={`tel:${vendor.phone}`} aria-label={`Call ${vendor.name}`}>
                          <Phone size={15} aria-hidden /> Call
                        </a>
                      )}
                      {vendor.email && (
                        <a className="btn btn-secondary btn-sm" href={`mailto:${vendor.email}`} aria-label={`Email ${vendor.name}`}>
                          <Mail size={15} aria-hidden /> Email
                        </a>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Trash2 size={15} />}
                        aria-label={`Remove ${vendor.name}`}
                        onClick={() => del(vendor)}
                      >
                        Remove
                      </Button>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </>
      </ListState>

      <VendorDetailSheet
        open={!!profile}
        vendor={profile}
        expenses={expenses}
        bids={bids}
        tasks={tasks}
        onClose={() => setProfile(null)}
        onEdit={(vendor) => {
          setProfile(null)
          editor.openEdit(vendor)
        }}
      />

      <EditorSheet editor={editor} newTitle="New vendor" editTitle="Edit vendor">
        {(initial) => <VendorForm projectId={projectId} initial={initial} onDone={editor.close} />}
      </EditorSheet>
    </section>
  )
}
