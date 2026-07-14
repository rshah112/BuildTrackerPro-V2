import { useMemo, useState } from 'react'
import { Plus, Trash2, FileEdit } from 'lucide-react'
import type { BudgetLineItem, ChangeOrder } from '../../domain/types'
import type { ChangeOrderStatus } from '../../domain/enums'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Stat } from '../../components/ui/Stat'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { SearchField } from '../../components/ui/SearchField'
import { matchesQuery } from '../../lib/search'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { useSyncActuals } from '../budget/useSyncActuals'
import { useRestoreRow } from '../../data/hooks'
import { changeOrderOperationSummary } from '../operations/operationsSummary'
import { useChangeOrders, useRemoveChangeOrder } from './useChangeOrders'
import { ChangeOrderForm } from './ChangeOrderForm'
import '../operations/operations.css'

type Filter = 'all' | ChangeOrderStatus | 'unassigned'

const EMPTY_ROWS: never[] = []
const STATUS_TONE: Record<ChangeOrderStatus, BadgeTone> = {
  pending: 'warn',
  approved: 'info',
  paid: 'success',
}
const STATUS_LABEL: Record<ChangeOrderStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  paid: 'Paid',
}
const IMPACT_LABEL: Record<ChangeOrderStatus, string> = {
  pending: 'Potential exposure',
  approved: 'Approved commitment',
  paid: 'Paid cost',
}
const STATUS_ORDER: Record<ChangeOrderStatus, number> = { pending: 0, approved: 1, paid: 2 }

function upsert(list: ChangeOrder[], item: ChangeOrder): ChangeOrder[] {
  return list.some((order) => order.id === item.id)
    ? list.map((order) => (order.id === item.id ? item : order))
    : [...list, item]
}

const norm = (value: string) => value.trim().toLocaleLowerCase()
function findLinkedLine(order: ChangeOrder, lineItems: BudgetLineItem[]): BudgetLineItem | undefined {
  if (order.budgetLineItemId) {
    const byId = lineItems.find((lineItem) => lineItem.id === order.budgetLineItemId)
    if (byId) return byId
  }
  if (!order.budgetLineItemTitle.trim()) return undefined
  return lineItems.find(
    (lineItem) =>
      norm(lineItem.title) === norm(order.budgetLineItemTitle) &&
      norm(lineItem.categoryName) === norm(order.categoryName),
  )
}

export function ChangeOrdersScreen() {
  const { projectId } = useCurrentProject()
  const lineItemsQuery = useLineItems(projectId!)
  const ordersQuery = useChangeOrders(projectId!)
  const lineItems = lineItemsQuery.data ?? EMPTY_ROWS
  const orders = ordersQuery.data ?? EMPTY_ROWS
  const isLoading = lineItemsQuery.isLoading || ordersQuery.isLoading
  const error = lineItemsQuery.error ?? ordersQuery.error
  const remove = useRemoveChangeOrder()
  const restore = useRestoreRow('change_orders')
  const syncActuals = useSyncActuals(projectId!)
  const toast = useToast()
  const editor = useEditor<ChangeOrder>()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const summary = useMemo(() => changeOrderOperationSummary(orders), [orders])
  const visible = useMemo(
    () =>
      orders
        .filter((order) => {
          const unassigned = !order.budgetLineItemId && !order.budgetLineItemTitle.trim()
          const filterMatch =
            filter === 'all' ||
            (filter === 'unassigned' ? unassigned : order.status === filter)
          return (
            filterMatch &&
            matchesQuery(q, order.title, order.categoryName, order.notes, order.budgetLineItemTitle)
          )
        })
        .sort(
          (a, b) =>
            STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
            (b.createdAt || '').localeCompare(a.createdAt || ''),
        ),
    [orders, filter, q],
  )

  if (!projectId) return null

  const removeAndSync = async (order: ChangeOrder) => {
    await remove.mutateAsync(order.id)
    await syncActuals({ changeOrders: orders.filter((item) => item.id !== order.id) })
    toast.success('Change order moved to Trash', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await restore.mutateAsync(order.id)
          await syncActuals({ changeOrders: orders })
        },
      },
    })
  }
  const resetView = () => {
    setQ('')
    setFilter('all')
  }

  return (
    <section className="operations-screen">
      <ScreenHeader
        title="Change orders"
        subtitle="Potential, approved and paid scope impact"
        trailing={
          orders.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add change order
            </Button>
          ) : undefined
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={orders.length === 0}
        errorLabel="Couldn’t load change orders"
        empty={
          <EmptyState
            icon={FileEdit}
            title="No change orders yet"
            body="Track scope changes from pending through approved to paid; approved and paid orders flow into your budget."
            action={
              <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add change order
              </Button>
            }
          />
        }
      >
        <>
          <div className="metric-grid operations-summary" aria-label="Change-order impact summary">
            <Stat
              label="All changes"
              value={fmt(summary.total.amount)}
              sub={`${summary.total.count} order${summary.total.count === 1 ? '' : 's'} · ${summary.unassignedCount} unassigned`}
            />
            <Stat
              label="Pending"
              value={fmt(summary.pending.amount)}
              sub={`${summary.pending.count} awaiting decision`}
            />
            <Stat
              label="Approved"
              value={fmt(summary.approved.amount)}
              sub={`${summary.approved.count} committed`}
            />
            <Stat
              label="Paid"
              value={fmt(summary.paid.amount)}
              sub={`${summary.paid.count} completed`}
            />
          </div>

          <div className="operations-toolbar">
            <SearchField value={q} onChange={setQ} placeholder="Search title, budget line, category or notes" />
            <div className="operations-filter">
              <SegmentedControl<Filter>
                ariaLabel="Filter change orders"
                value={filter}
                onChange={setFilter}
                segments={[
                  { value: 'all', label: `All (${summary.total.count})` },
                  { value: 'pending', label: `Pending (${summary.pending.count})` },
                  { value: 'approved', label: `Approved (${summary.approved.count})` },
                  { value: 'paid', label: `Paid (${summary.paid.count})` },
                  { value: 'unassigned', label: `Unassigned (${summary.unassignedCount})` },
                ]}
              />
            </div>
          </div>

          {visible.length === 0 ? (
            <EmptyState
              icon={FileEdit}
              title="No change orders match this view"
              body="Clear the search or return to all statuses."
              action={<Button variant="secondary" onClick={resetView}>Clear filters</Button>}
            />
          ) : (
            <ul className="operations-list">
              {visible.map((order) => {
                const lineItem = findLinkedLine(order, lineItems)
                const hasAssignmentReference = Boolean(
                  order.budgetLineItemId || order.budgetLineItemTitle.trim(),
                )
                const limit = lineItem
                  ? lineItem.isAllowance
                    ? lineItem.allowanceAmount
                    : lineItem.budget
                  : null
                const assignment = lineItem
                  ? `${lineItem.categoryName} / ${lineItem.title}`
                  : order.budgetLineItemTitle ||
                    order.categoryName ||
                    (hasAssignmentReference ? 'Budget line unavailable' : 'Unassigned')
                return (
                  <li key={order.id}>
                    <article className="operations-record">
                      <button
                        type="button"
                        className="operations-record-open"
                        onClick={() => editor.openEdit(order)}
                        aria-label={`Edit change order ${order.title}`}
                      >
                        <span className="operations-record-title">
                          <strong>{order.title}</strong>
                          <span className="operations-record-meta">
                            {assignment}
                            {order.createdAt ? ` · created ${fmtDate(order.createdAt)}` : ''}
                          </span>
                        </span>
                        <span className="operations-record-badges">
                          <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                          {!lineItem && (
                            <Badge tone="warn">
                              {hasAssignmentReference ? 'Line unavailable' : 'Unassigned'}
                            </Badge>
                          )}
                        </span>
                      </button>

                      <dl className="operations-impact-grid" aria-label={`${order.title} financial impact`}>
                        <div>
                          <dt>Change impact</dt>
                          <dd>
                            +{fmt(order.amount)}
                            <small>{IMPACT_LABEL[order.status]}</small>
                          </dd>
                        </div>
                        <div>
                          <dt>Linked line</dt>
                          <dd>
                            {lineItem && limit !== null ? `${fmt(lineItem.actual)} / ${fmt(limit)}` : '—'}
                            <small>
                              {lineItem
                                ? lineItem.isAllowance
                                  ? 'actual / allowance'
                                  : 'actual / budget'
                                : hasAssignmentReference
                                  ? 'Budget line unavailable'
                                  : 'No budget line assigned'}
                            </small>
                          </dd>
                        </div>
                        <div>
                          <dt>Expected payment</dt>
                          <dd>
                            {order.expectedPaymentDate ? fmtDate(order.expectedPaymentDate) : 'Not scheduled'}
                            <small>{order.categoryName || 'No category'}</small>
                          </dd>
                        </div>
                      </dl>

                      <div className="operations-record-actions">
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={`Edit ${order.title}`}
                          onClick={() => editor.openEdit(order)}
                        >
                          Edit details
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          leadingIcon={<Trash2 size={15} />}
                          aria-label={`Remove ${order.title}`}
                          onClick={() => removeAndSync(order)}
                        >
                          Remove
                        </Button>
                      </div>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      </ListState>

      <EditorSheet editor={editor} newTitle="New change order" editTitle="Edit change order">
        {(initial) => (
          <ChangeOrderForm
            projectId={projectId}
            lineItems={lineItems}
            initial={initial}
            onSaved={async (saved) => {
              await syncActuals({ changeOrders: upsert(orders, saved) })
              toast.success('Change order saved')
            }}
            onPostSaveError={() =>
              toast.error('Change order saved, but budget totals could not refresh. Reopen Budget to reconcile them.')
            }
            onDone={editor.close}
          />
        )}
      </EditorSheet>
    </section>
  )
}
