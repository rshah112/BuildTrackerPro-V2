import { Plus, Trash2, Sparkles } from 'lucide-react'
import type { AllowanceSelection } from '../../domain/types'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { allowanceOverage } from '../../lib/budgetAggregates'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { EmptyState, ListState } from '../../components/ui/Feedback'
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
  const editor = useEditor<AllowanceSelection>()

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
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add selection
            </Button>
          ) : undefined
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={allowanceLineItems.length === 0 || selections.length === 0}
        errorLabel="Couldn’t load allowances"
        empty={
          allowanceLineItems.length === 0 ? (
            <EmptyState
              icon={Sparkles}
              title="No allowance line items"
              body="Mark a budget line item as an allowance (in Budget) first — then record your finish selections against it here."
            />
          ) : (
            <EmptyState
              icon={Sparkles}
              title="No allowance selections yet"
              body="Record the finishes you've chosen against allowance line items to see where you're over or under."
              action={
                <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                  Add selection
                </Button>
              }
            />
          )
        }
      >
        <ul className="card-list">
          {selections.map((s) => (
            <li key={s.id} className="expense-row">
              <button className="expense-row-open" onClick={() => editor.openEdit(s)}>
                <div className="expense-row-main">
                  <strong>{titleOf(s.lineItemId)}</strong>
                  <span className="muted">
                    {s.vendor || 'Selection'} · {fmtDate(s.selectionDate)}
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
      </ListState>

      <EditorSheet editor={editor} newTitle="New allowance selection" editTitle="Edit allowance selection">
        {(initial) => (
          <AllowanceForm
            projectId={projectId}
            lineItems={allowanceLineItems}
            initial={initial}
            onSaved={async (saved) => {
              await syncActuals({ allowanceSelections: upsert(selections, saved) })
              toast.success('Allowance selection saved')
            }}
            onDone={editor.close}
          />
        )}
      </EditorSheet>
    </section>
  )
}
