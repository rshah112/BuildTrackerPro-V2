import { useState } from 'react'
import { Plus, Trash2, FileEdit } from 'lucide-react'
import type { ChangeOrder } from '../../domain/types'
import type { ChangeOrderStatus } from '../../domain/enums'
import { fmt, sumBy } from '../../lib/money'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Stat } from '../../components/ui/Stat'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { useSyncActuals } from '../budget/useSyncActuals'
import { useChangeOrders, useRemoveChangeOrder } from './useChangeOrders'
import { ChangeOrderForm } from './ChangeOrderForm'

type Filter = 'all' | ChangeOrderStatus
const STATUS_TONE: Record<ChangeOrderStatus, BadgeTone> = {
  pending: 'warn',
  approved: 'info',
  paid: 'success',
}

function upsert(list: ChangeOrder[], item: ChangeOrder): ChangeOrder[] {
  return list.some((o) => o.id === item.id) ? list.map((o) => (o.id === item.id ? item : o)) : [...list, item]
}

export function ChangeOrdersScreen() {
  const { projectId } = useCurrentProject()
  const { data: lineItems = [] } = useLineItems(projectId!)
  const { data: orders = [], isLoading, error } = useChangeOrders(projectId!)
  const remove = useRemoveChangeOrder()
  const syncActuals = useSyncActuals(projectId!)
  const toast = useToast()
  const editor = useEditor<ChangeOrder>()
  const [filter, setFilter] = useState<Filter>('all')

  if (!projectId) return null

  const visible = orders.filter((o) => (filter === 'all' ? true : o.status === filter))
  const pendingTotal = sumBy(orders.filter((o) => o.status === 'pending'), (o) => o.amount)
  const approvedTotal = sumBy(orders.filter((o) => o.status === 'approved'), (o) => o.amount)
  const paidTotal = sumBy(orders.filter((o) => o.status === 'paid'), (o) => o.amount)

  const removeAndSync = async (o: ChangeOrder) => {
    await remove.mutateAsync(o.id)
    await syncActuals({ changeOrders: orders.filter((x) => x.id !== o.id) })
    toast.success('Change order deleted')
  }

  return (
    <section>
      <ScreenHeader
        title="Change orders"
        trailing={
          orders.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add change order
            </Button>
          ) : undefined
        }
      />

      {error && <p role="alert" className="error-banner">Couldn’t load change orders: {(error as Error).message}</p>}
      {isLoading && <ListSkeleton />}

      {!isLoading && orders.length === 0 ? (
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
      ) : (
        !isLoading && (
          <>
            <div className="metric-grid compact">
              <Stat label="Pending" value={fmt(pendingTotal)} />
              <Stat label="Approved" value={fmt(approvedTotal)} />
              <Stat label="Paid" value={fmt(paidTotal)} />
            </div>

            <div className="list-toolbar">
              <SegmentedControl<Filter>
                ariaLabel="Filter change orders"
                value={filter}
                onChange={setFilter}
                segments={[
                  { value: 'all', label: 'All' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'paid', label: 'Paid' },
                ]}
              />
            </div>

            <ul className="card-list">
              {visible.map((o) => (
                <li key={o.id} className="expense-row">
                  <button className="expense-row-open" onClick={() => editor.openEdit(o)}>
                    <div className="expense-row-main">
                      <strong>{o.title}</strong>
                      <span className="muted">{o.budgetLineItemTitle || o.categoryName || 'Unassigned'}</span>
                    </div>
                    <div className="expense-row-amount">
                      <Badge tone={STATUS_TONE[o.status]}>{o.status}</Badge>
                      <strong>{fmt(o.amount)}</strong>
                    </div>
                  </button>
                  <button className="expense-row-del" onClick={() => removeAndSync(o)} aria-label="Delete change order">
                    <Trash2 size={17} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )
      )}

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
            onDone={editor.close}
          />
        )}
      </EditorSheet>
    </section>
  )
}
