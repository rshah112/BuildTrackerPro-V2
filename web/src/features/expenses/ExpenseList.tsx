import { useMemo, useState } from 'react'
import { Plus, Trash2, Receipt as ReceiptIcon, FileText } from 'lucide-react'
import type { BudgetLineItem, Expense } from '../../domain/types'
import { balanceDue, effectiveAmountPaid } from '../../lib/expenseMath'
import { fmt, sumBy } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Stat } from '../../components/ui/Stat'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useSyncActuals } from '../budget/useSyncActuals'
import { ExpenseForm } from './ExpenseForm'
import { upsertExpense } from './recalculateLineItemActuals'
import { useExpenses, useRemoveExpense } from './useExpenses'

type Filter = 'all' | 'open' | 'paid'

/** An expense is "open" if it still owes money, regardless of the isPaid flag — so a
 *  partial payment shows as Partial/open, not a misleading "Paid". */
function payStatus(e: Expense): { label: string; tone: 'success' | 'warn'; open: boolean } {
  const due = balanceDue(e)
  if (due <= 0 && e.isPaid) return { label: 'Paid', tone: 'success', open: false }
  if (effectiveAmountPaid(e) > 0) return { label: 'Partial', tone: 'warn', open: true }
  return { label: 'Open', tone: 'warn', open: true }
}

export function ExpenseList({ projectId, lineItems }: { projectId: string; lineItems: BudgetLineItem[] }) {
  const { data: expenses = [], isLoading, error } = useExpenses(projectId)
  const removeExpense = useRemoveExpense()
  const syncActuals = useSyncActuals(projectId)
  const toast = useToast()
  const confirm = useConfirm()
  const editor = useEditor<Expense>()
  const [filter, setFilter] = useState<Filter>('all')

  const sorted = useMemo(() => [...expenses].sort((a, b) => b.date.localeCompare(a.date)), [expenses])
  const visible = useMemo(
    () =>
      sorted.filter((e) => {
        if (filter === 'all') return true
        const open = balanceDue(e) > 0
        return filter === 'open' ? open : !open
      }),
    [sorted, filter],
  )
  const { total, paid, outstanding } = useMemo(
    () => ({
      total: sumBy(expenses, (e) => e.amount),
      paid: sumBy(expenses, effectiveAmountPaid),
      outstanding: sumBy(expenses, balanceDue),
    }),
    [expenses],
  )

  const removeAndSync = async (expense: Expense) => {
    if (!(await confirm({ title: 'Delete expense?', message: `${expense.vendorName || 'This expense'} will be removed.`, destructive: true }))) return
    await removeExpense.mutateAsync(expense.id)
    await syncActuals({ expenses: expenses.filter((e) => e.id !== expense.id) })
    toast.success('Expense deleted')
  }

  if (isLoading) return <ListSkeleton />
  if (error) return <p role="alert" className="error-banner">Couldn’t load expenses: {(error as Error).message}</p>

  return (
    <>
      <div className="metric-grid compact">
        <Stat label="Invoiced" value={fmt(total)} />
        <Stat label="Paid" value={fmt(paid)} />
        <Stat label="Open" value={fmt(outstanding)} />
      </div>

      {expenses.length > 0 && (
        <div className="list-toolbar">
          <SegmentedControl<Filter>
            ariaLabel="Filter expenses"
            value={filter}
            onChange={setFilter}
            segments={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'paid', label: 'Paid' },
            ]}
          />
          <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
            Add expense
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title={expenses.length === 0 ? 'No expenses yet' : 'Nothing here'}
          body={
            expenses.length === 0
              ? 'Log invoices, receipts, and payments to track spend against your budget.'
              : 'No expenses match this filter.'
          }
          action={
            expenses.length === 0 ? (
              <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add expense
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="card-list">
          {visible.map((e) => (
            <li key={e.id} className="expense-row">
              <button className="expense-row-open" onClick={() => editor.openEdit(e)}>
                <div className="expense-row-main">
                  <strong>{e.vendorName || 'Unnamed vendor'}</strong>
                  <span className="muted">
                    {fmtDate(e.date)} · {e.categoryName || 'Uncategorized'}
                    {e.budgetLineItemTitle ? ` · ${e.budgetLineItemTitle}` : ''}
                  </span>
                </div>
                <div className="expense-row-amount">
                  <div className="expense-row-badges">
                    {(() => {
                      const st = payStatus(e)
                      return <Badge tone={st.tone}>{st.label}</Badge>
                    })()}
                    {e.receiptObjectKey && <FileText size={15} className="muted" role="img" aria-label="Has receipt" />}
                  </div>
                  <strong>{fmt(e.amount)}</strong>
                </div>
              </button>
              <button className="expense-row-del" onClick={() => removeAndSync(e)} aria-label="Delete expense">
                <Trash2 size={17} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <EditorSheet editor={editor} newTitle="New expense" editTitle="Edit expense">
        {(initial) => (
          <ExpenseForm
            projectId={projectId}
            lineItems={lineItems}
            initial={initial}
            onSaved={async (saved) => {
              await syncActuals({ expenses: upsertExpense(expenses, saved) })
              toast.success('Expense saved')
            }}
            onDone={editor.close}
          />
        )}
      </EditorSheet>
    </>
  )
}
