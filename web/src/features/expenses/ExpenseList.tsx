import { useMemo, useState } from 'react'
import { Plus, Trash2, Receipt as ReceiptIcon, FileText } from 'lucide-react'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense } from '../../domain/types'
import { useRows } from '../../data/hooks'
import { balanceDue, effectiveAmountPaid } from '../../lib/expenseMath'
import { fmt, sumBy } from '../../lib/money'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Sheet } from '../../components/ui/Sheet'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useUpdateLineItem } from '../budget/useBudget'
import { ExpenseForm } from './ExpenseForm'
import { actualPatchesForExpenses, upsertExpense } from './recalculateLineItemActuals'
import { useExpenses, useRemoveExpense } from './useExpenses'

type Filter = 'all' | 'open' | 'paid'

export function ExpenseList({ projectId, lineItems }: { projectId: string; lineItems: BudgetLineItem[] }) {
  const { data: expenses = [], isLoading, error } = useExpenses(projectId)
  const { data: changeOrders = [], isLoading: ordersLoading } = useRows<ChangeOrder>('change_orders', { projectId })
  const { data: allowanceSelections = [], isLoading: selectionsLoading } = useRows<AllowanceSelection>(
    'allowance_selections',
    { projectId },
  )
  const removeExpense = useRemoveExpense()
  const updateLineItem = useUpdateLineItem()
  const toast = useToast()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)
  const [filter, setFilter] = useState<Filter>('all')

  const sorted = useMemo(() => [...expenses].sort((a, b) => b.date.localeCompare(a.date)), [expenses])
  const visible = sorted.filter((e) => (filter === 'all' ? true : filter === 'paid' ? e.isPaid : !e.isPaid))
  const total = sumBy(expenses, (e) => e.amount)
  const paid = sumBy(expenses, effectiveAmountPaid)
  const outstanding = sumBy(expenses, balanceDue)

  const syncActuals = async (nextExpenses: Expense[]) => {
    const patches = actualPatchesForExpenses({ lineItems, expenses: nextExpenses, changeOrders, allowanceSelections })
    await Promise.all(patches.map((patch) => updateLineItem.mutateAsync({ id: patch.id, patch: { actual: patch.actual } })))
  }

  const removeAndSync = async (expense: Expense) => {
    await removeExpense.mutateAsync(expense.id)
    await syncActuals(expenses.filter((e) => e.id !== expense.id))
    toast.success('Expense deleted')
  }

  if (isLoading || ordersLoading || selectionsLoading) return <div className="loading">Loading expenses…</div>
  if (error) return <p role="alert">Couldn’t load expenses: {(error as Error).message}</p>

  return (
    <>
      <div className="metric-grid compact">
        <div className="metric-card">
          <span>Invoiced</span>
          <strong>{fmt(total)}</strong>
        </div>
        <div className="metric-card">
          <span>Paid</span>
          <strong>{fmt(paid)}</strong>
        </div>
        <div className="metric-card">
          <span>Open</span>
          <strong>{fmt(outstanding)}</strong>
        </div>
      </div>

      {expenses.length > 0 && (
        <div className="row-between" style={{ margin: '1rem 0 0.75rem' }}>
          <div style={{ flex: 1, maxWidth: 320 }}>
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
          </div>
          <Button size="sm" leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
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
              <Button leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
                Add expense
              </Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="card-list">
          {visible.map((e) => (
            <li key={e.id} className="expense-row">
              <button className="expense-row-open" onClick={() => setEditing(e)}>
                <div className="expense-row-main">
                  <strong>{e.vendorName || 'Unnamed vendor'}</strong>
                  <span className="muted">
                    {new Date(e.date).toLocaleDateString()} · {e.categoryName || 'Uncategorized'}
                    {e.budgetLineItemTitle ? ` · ${e.budgetLineItemTitle}` : ''}
                  </span>
                </div>
                <div className="expense-row-amount">
                  <div className="expense-row-badges">
                    <Badge tone={e.isPaid ? 'success' : 'warn'}>{e.isPaid ? 'Paid' : 'Open'}</Badge>
                    {e.receiptObjectKey && <FileText size={15} className="muted" aria-label="Has receipt" />}
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

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New expense' : 'Edit expense'}
      >
        {editing !== null && (
          <ExpenseForm
            projectId={projectId}
            lineItems={lineItems}
            initial={editing === 'new' ? undefined : editing}
            onSaved={async (saved) => {
              await syncActuals(upsertExpense(expenses, saved))
              toast.success('Expense saved')
            }}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </>
  )
}
