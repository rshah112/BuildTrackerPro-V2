import { useState } from 'react'
import { Plus, Trash2, Sparkles } from 'lucide-react'
import type { AllowanceSelection } from '../../domain/types'
import { fmt } from '../../lib/money'
import { allowanceOverage } from '../../lib/budgetAggregates'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { useSyncActuals } from '../budget/useSyncActuals'
import { useExpenses } from '../expenses/useExpenses'
import { useAllowances, useRemoveAllowance } from './useAllowances'
import { AllowanceForm } from './AllowanceForm'

function upsert(list: AllowanceSelection[], item: AllowanceSelection): AllowanceSelection[] {
  return list.some((a) => a.id === item.id) ? list.map((a) => (a.id === item.id ? item : a)) : [...list, item]
}

export function AllowancesScreen() {
  const { projectId } = useCurrentProject()
  const { data: lineItems = [] } = useLineItems(projectId!)
  const { data: expenses = [] } = useExpenses(projectId!)
  const { data: selections = [], isLoading, error } = useAllowances(projectId!)
  const remove = useRemoveAllowance()
  const syncActuals = useSyncActuals(projectId!)
  const toast = useToast()
  const confirm = useConfirm()
  const [editing, setEditing] = useState<AllowanceSelection | 'new' | null>(null)

  if (!projectId) return null

  // Selections can only be made against allowance line items.
  const allowanceLineItems = lineItems.filter((li) => li.isAllowance)
  const titleOf = (id: string) => {
    const li = lineItems.find((l) => l.id === id)
    return li ? `${li.categoryName} / ${li.title}` : 'Line item'
  }
  const overage = allowanceOverage(lineItems, selections, expenses)
  const overageLabel = overage > 0 ? `${fmt(overage)} over allowance` : 'Within allowance'

  const removeAndSync = async (s: AllowanceSelection) => {
    if (!(await confirm({ title: 'Delete selection?', message: `${titleOf(s.lineItemId)} selection will be removed.`, destructive: true }))) return
    await remove.mutateAsync(s.id)
    await syncActuals({ allowanceSelections: selections.filter((x) => x.id !== s.id) })
    toast.success('Allowance selection deleted')
  }

  return (
    <section>
      <ScreenHeader
        title="Allowances"
        subtitle={selections.length > 0 ? overageLabel : undefined}
        trailing={
          selections.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add selection
            </Button>
          ) : undefined
        }
      />

      {error && <p role="alert">Couldn’t load allowances: {(error as Error).message}</p>}
      {isLoading && <div className="loading">Loading allowances…</div>}

      {!isLoading && allowanceLineItems.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No allowance line items"
          body="Mark a budget line item as an allowance (in Budget) first — then record your finish selections against it here."
        />
      ) : !isLoading && selections.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No allowance selections yet"
          body="Record the finishes you've chosen against allowance line items to see where you're over or under."
          action={
            <Button leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add selection
            </Button>
          }
        />
      ) : (
        <ul className="card-list">
          {selections.map((s) => (
            <li key={s.id} className="expense-row">
              <button className="expense-row-open" onClick={() => setEditing(s)}>
                <div className="expense-row-main">
                  <strong>{titleOf(s.lineItemId)}</strong>
                  <span className="muted">
                    {s.vendor || 'Selection'} · {new Date(s.selectionDate).toLocaleDateString()}
                  </span>
                </div>
                <strong>{fmt(s.amount)}</strong>
              </button>
              <button
                className="expense-row-del"
                onClick={() => removeAndSync(s)}
                aria-label="Delete allowance selection"
              >
                <Trash2 size={17} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New allowance selection' : 'Edit allowance selection'}
      >
        {editing !== null && (
          <AllowanceForm
            projectId={projectId}
            lineItems={allowanceLineItems}
            initial={editing === 'new' ? undefined : editing}
            onSaved={async (saved) => {
              await syncActuals({ allowanceSelections: upsert(selections, saved) })
              toast.success('Allowance selection saved')
            }}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  )
}
