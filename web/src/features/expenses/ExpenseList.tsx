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
import { SearchField } from '../../components/ui/SearchField'
import { matchesQuery } from '../../lib/search'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useRestoreRow } from '../../data/hooks'
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

/** Due / overdue chip for an expense that still owes money, from its expected-payment or due
 *  date. Surfaces the dates that now live behind "More details" so cash flow is scannable. */
function dueInfo(e: Expense): { label: string; overdue: boolean } | null {
  if (balanceDue(e) <= 0) return null
  const iso = e.expectedPaymentDate || e.dueDate
  const [y, m, d] = (iso?.slice(0, 10) ?? '').split('-').map(Number)
  if (!y || !m || !d) return null
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((new Date(y, m - 1, d).getTime() - start.getTime()) / 86_400_000)
  if (diff < 0) return { label: `Overdue ${Math.abs(diff)}d`, overdue: true }
  if (diff === 0) return { label: 'Due today', overdue: false }
  return { label: `Due ${fmtDate(`${y}-${m}-${d}`, { month: 'short', day: 'numeric' })}`, overdue: false }
}

export function ExpenseList({ projectId, lineItems }: { projectId: string; lineItems: BudgetLineItem[] }) {
  const { data: expenses = [], isLoading, error } = useExpenses(projectId)
  const removeExpense = useRemoveExpense()
  const restore = useRestoreRow('expenses')
  const syncActuals = useSyncActuals(projectId)
  const toast = useToast()
  const confirm = useConfirm()
  const editor = useEditor<Expense>()
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')

  const sorted = useMemo(() => [...expenses].sort((a, b) => b.date.localeCompare(a.date)), [expenses])
  const visible = useMemo(
    () =>
      sorted.filter((e) => {
        if (filter !== 'all') {
          const open = balanceDue(e) > 0
          if (filter === 'open' ? !open : open) return false
        }
        return matchesQuery(q, e.vendorName, e.invoiceNumber, e.notes, e.categoryName, e.budgetLineItemTitle)
      }),
    [sorted, filter, q],
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
    toast.success('Expense moved to Trash', {
      action: {
        label: 'Undo',
        onClick: async () => {
          await restore.mutateAsync(expense.id)
          await syncActuals({ expenses }) // pre-delete list still includes this expense
        },
      },
    })
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
      {expenses.length > 2 && <SearchField value={q} onChange={setQ} placeholder="Search vendor, invoice, notes, line item" />}

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
          {visible.map((e) => {
            const st = payStatus(e)
            const due = dueInfo(e)
            return (
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
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {due && <span className={`expense-due${due.overdue ? ' overdue' : ''}`}>{due.label}</span>}
                      {e.receiptObjectKey && <FileText size={15} className="muted" role="img" aria-label="Has receipt" />}
                    </div>
                    <strong>{fmt(e.amount)}</strong>
                    {st.label === 'Partial' && <span className="expense-left">{fmt(balanceDue(e))} left</span>}
                  </div>
                </button>
                <button className="expense-row-del" onClick={() => removeAndSync(e)} aria-label="Delete expense">
                  <Trash2 size={17} aria-hidden />
                </button>
              </li>
            )
          })}
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
