import { useMemo, useState } from 'react'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense } from '../../domain/types'
import { useRows } from '../../data/hooks'
import { balanceDue, effectiveAmountPaid } from '../../lib/expenseMath'
import { fmt, sumBy } from '../../lib/money'
import { useUpdateLineItem } from '../budget/useBudget'
import { ExpenseForm } from './ExpenseForm'
import { actualPatchesForExpenses, upsertExpense } from './recalculateLineItemActuals'
import { useExpenses, useRemoveExpense } from './useExpenses'

export function ExpenseList({ projectId, lineItems }: { projectId: string; lineItems: BudgetLineItem[] }) {
  const { data: expenses = [], isLoading, error } = useExpenses(projectId)
  const { data: changeOrders = [], isLoading: ordersLoading } = useRows<ChangeOrder>('change_orders', { projectId })
  const { data: allowanceSelections = [], isLoading: selectionsLoading } = useRows<AllowanceSelection>(
    'allowance_selections',
    { projectId },
  )
  const removeExpense = useRemoveExpense()
  const updateLineItem = useUpdateLineItem()
  const [editing, setEditing] = useState<Expense | 'new' | null>(null)

  const sorted = useMemo(
    () => [...expenses].sort((a, b) => b.date.localeCompare(a.date)),
    [expenses],
  )
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
  }

  if (editing) {
    return (
      <section>
        <h1>{editing === 'new' ? 'New expense' : 'Edit expense'}</h1>
        <ExpenseForm
          projectId={projectId}
          lineItems={lineItems}
          initial={editing === 'new' ? undefined : editing}
          onSaved={(saved) => syncActuals(upsertExpense(expenses, saved))}
          onDone={() => setEditing(null)}
        />
      </section>
    )
  }
  if (isLoading || ordersLoading || selectionsLoading) return <div className="loading">Loading expenses...</div>
  if (error) return <p role="alert">Couldn't load expenses: {(error as Error).message}</p>

  return (
    <>
      <div className="metric-grid compact">
        <div className="metric-card"><span>Invoiced</span><strong>{fmt(total)}</strong></div>
        <div className="metric-card"><span>Paid</span><strong>{fmt(paid)}</strong></div>
        <div className="metric-card"><span>Open</span><strong>{fmt(outstanding)}</strong></div>
      </div>

      <div className="row-between" style={{ marginTop: '1rem' }}>
        <span>{expenses.length} {expenses.length === 1 ? 'expense' : 'expenses'}</span>
        <button onClick={() => setEditing('new')}>Add expense</button>
      </div>

      {expenses.length === 0 && <p>No expenses yet - add invoices, receipts, and payments here.</p>}
      <ul className="card-list">
        {sorted.map((e) => (
          <li key={e.id} className="card">
            <div>
              <strong>{e.vendorName || 'Unnamed vendor'}</strong>
              <p className="muted">
                {e.invoiceNumber && <>#{e.invoiceNumber} · </>}
                {new Date(e.date).toLocaleDateString()} · {e.categoryName || 'Uncategorized'}
              </p>
              {e.budgetLineItemTitle && <p className="muted">{e.budgetLineItemTitle}</p>}
            </div>
            <div className="card-actions">
              <span className={e.isPaid ? 'status paid' : 'status open'}>{e.isPaid ? 'Paid' : 'Open'}</span>
              <strong>{fmt(e.amount)}</strong>
              {e.receiptObjectKey && <span className="status">Receipt</span>}
              <button className="secondary" onClick={() => setEditing(e)}>Edit</button>
              <button className="danger" onClick={() => removeAndSync(e)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
