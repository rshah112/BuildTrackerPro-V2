import { useMemo, useState } from 'react'
import { Plus, Trash2, Receipt as ReceiptIcon, FileText } from 'lucide-react'
import type { BudgetLineItem, Expense } from '../../domain/types'
import {
  balanceDue,
  effectiveAmountPaid,
  expensePaymentState,
  payableBalance,
  retainageHeld,
} from '../../lib/expenseMath'
import { fmt, fmtExact, sumBy } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { SearchField } from '../../components/ui/SearchField'
import { DataTable, type DataColumn, type SortState } from '../../components/ui/DataTable'
import { SummaryStrip } from '../../components/ui/SummaryStrip'
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
import { Sheet } from '../../components/ui/Sheet'
import { useLoan, useLoanDraws } from '../loan/useLoan'
import { useAllocations, useDisbursements } from '../loan/useTreasury'
import { activeAllocations, expenseSettlements } from '../loan/treasury'
import { ReimburseSheet } from '../loan/ReimburseSheet'

type Filter = 'all' | 'open' | 'paid' | 'unassigned'

/** An expense is "open" if it still owes money, regardless of the isPaid flag — so a
 *  partial payment shows as Partial/open, not a misleading "Paid". */
function payStatus(e: Expense): { label: string; tone: 'success' | 'warn' | 'info' } {
  const state = expensePaymentState(e)
  if (state === 'paid') return { label: 'Paid', tone: 'success' }
  if (state === 'retainage') return { label: 'Retainage', tone: 'info' }
  if (state === 'partial') return { label: 'Partial', tone: 'warn' }
  return { label: 'Open', tone: 'warn' }
}

/** Due / overdue chip for an expense that still owes money, from its expected-payment or due
 *  date. Surfaces the dates that now live behind "More details" so cash flow is scannable. */
function dueInfo(e: Expense): { label: string; overdue: boolean } | null {
  if (payableBalance(e) <= 0) return null
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
  // Reimbursement tracking only appears once the project is actually financed.
  const { data: loans = [] } = useLoan(projectId)
  const { data: allDraws = [] } = useLoanDraws(projectId)
  const { data: allDisbursements = [] } = useDisbursements(projectId)
  const { data: rawAllocations = [] } = useAllocations(projectId)
  const hasLoan = loans.length > 0
  const [reimbursing, setReimbursing] = useState<Expense | null>(null)
  const draws = useMemo(() => allDraws.filter((d) => d.loanId === loans[0]?.id), [allDraws, loans])
  const drawIds = useMemo(() => new Set(draws.map((d) => d.id)), [draws])
  const disbursements = useMemo(
    () => allDisbursements.filter((db) => drawIds.has(db.drawId)),
    [allDisbursements, drawIds],
  )
  // Allocation rows outlive a trashed payment, so scope them to live disbursements.
  const allocations = useMemo(
    () => activeAllocations(rawAllocations, disbursements),
    [rawAllocations, disbursements],
  )
  const settlements = useMemo(() => expenseSettlements(expenses, allocations), [expenses, allocations])
  /** Which draw settled an expense, for the row subtitle. */
  const drawLabelFor = (expenseId: string): string => {
    const ids = new Set(
      allocations.filter((a) => a.expenseId === expenseId).map((a) => a.disbursementId),
    )
    const names = draws
      .filter((d) => disbursements.some((db) => ids.has(db.id) && db.drawId === d.id))
      .map((d) => d.description || `Draw ${fmtDate(d.drawDate)}`)
    return names.join(', ')
  }
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortState>({ key: 'date', direction: 'desc' })

  const visible = useMemo(
    () =>
      expenses
        .filter((e) => {
          if (filter === 'unassigned') {
            if (e.categoryName && (e.budgetLineItemId || e.budgetLineItemTitle)) return false
          } else if (filter !== 'all') {
            const open = balanceDue(e) > 0
            if (filter === 'open' ? !open : open) return false
          }
          return matchesQuery(q, e.vendorName, e.invoiceNumber, e.notes, e.categoryName, e.budgetLineItemTitle)
        })
        .sort((a, b) => {
          const direction = sort.direction === 'asc' ? 1 : -1
          const numeric = (value: (expense: Expense) => number) => (value(a) - value(b)) * direction
          if (sort.key === 'vendor') return a.vendorName.localeCompare(b.vendorName) * direction
          if (sort.key === 'category') return (a.categoryName || '').localeCompare(b.categoryName || '') * direction
          if (sort.key === 'amount') return numeric((expense) => expense.amount)
          if (sort.key === 'paid') return numeric(effectiveAmountPaid)
          if (sort.key === 'balance') return numeric(balanceDue)
          if (sort.key === 'status') return expensePaymentState(a).localeCompare(expensePaymentState(b)) * direction
          return a.date.localeCompare(b.date) * direction
        }),
    [expenses, filter, q, sort],
  )
  const { total, paid, outstanding, retainage, payable } = useMemo(
    () => ({
      total: sumBy(expenses, (e) => e.amount),
      paid: sumBy(expenses, effectiveAmountPaid),
      outstanding: sumBy(expenses, balanceDue),
      retainage: sumBy(expenses, retainageHeld),
      payable: sumBy(expenses, payableBalance),
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

  const columns: DataColumn<Expense>[] = [
    {
      key: 'date',
      header: 'Date',
      mobileLabel: 'Date',
      sortable: true,
      cell: (expense) => <span className="tnum">{fmtDate(expense.date)}</span>,
    },
    {
      key: 'vendor',
      header: 'Vendor / invoice',
      sortable: true,
      className: 'expense-primary-cell',
      cell: (expense) => (
        <button type="button" className="table-row-link" onClick={() => editor.openEdit(expense)}>
          <strong>{expense.vendorName || 'Unnamed vendor'}</strong>
          <span>{expense.invoiceNumber ? `Invoice ${expense.invoiceNumber}` : 'No invoice number'}</span>
        </button>
      ),
    },
    {
      key: 'category',
      header: 'Budget assignment',
      mobileLabel: 'Budget assignment',
      sortable: true,
      cell: (expense) => (
        <span className={!expense.categoryName || (!expense.budgetLineItemId && !expense.budgetLineItemTitle) ? 'assignment-missing' : undefined}>
          {expense.categoryName || 'Uncategorized'}
          {expense.budgetLineItemTitle ? <small>{expense.budgetLineItemTitle}</small> : <small>No line item</small>}
        </span>
      ),
    },
    { key: 'amount', header: 'Invoiced', mobileLabel: 'Invoiced', sortable: true, align: 'end', cell: (expense) => <strong>{fmtExact(expense.amount)}</strong> },
    { key: 'paid', header: 'Paid', mobileLabel: 'Paid', sortable: true, align: 'end', cell: (expense) => fmtExact(effectiveAmountPaid(expense)) },
    {
      key: 'balance',
      header: 'Balance',
      mobileLabel: 'Balance',
      sortable: true,
      align: 'end',
      cell: (expense) => {
        const balance = balanceDue(expense)
        return <span className={balance > 0 ? 'balance-open' : undefined}>{fmtExact(balance)}</span>
      },
    },
    {
      key: 'status',
      header: 'Status / due',
      mobileLabel: 'Status',
      sortable: true,
      cell: (expense) => {
        const status = payStatus(expense)
        const due = dueInfo(expense)
        return (
          <span className="expense-status-cell">
            <Badge tone={status.tone}>{status.label}</Badge>
            {due && <span className={`expense-due${due.overdue ? ' overdue' : ''}`}>{due.label}</span>}
          </span>
        )
      },
    },
    {
      key: 'document',
      header: 'Receipt',
      mobileLabel: 'Receipt',
      align: 'center',
      cell: (expense) => expense.receiptObjectKey ? <FileText size={17} className="muted" role="img" aria-label="Receipt attached" /> : <span className="muted" aria-label="No receipt">—</span>,
    },
    // Only meaningful once the project is financed: whose cash is still tied up in this cost.
    ...(hasLoan
      ? ([
          {
            key: 'reimbursed',
            header: 'Reimbursed',
            mobileLabel: 'Reimbursed',
            cell: (expense: Expense) => {
              const s = settlements.get(expense.id)
              if (!s || s.state === 'not_applicable') {
                return <span className="muted" aria-label="Not reimbursable">—</span>
              }
              // The badge keeps a short word so it can't wrap inside the pill on a phone;
              // the amount and the settling draw go on the detail line beneath it.
              const tone = s.state === 'reimbursed' ? 'success' : s.state === 'partial' ? 'warn' : 'info'
              const label = s.state === 'reimbursed' ? 'Reimbursed' : s.state === 'partial' ? 'Part repaid' : 'Owed'
              const drawNames = drawLabelFor(expense.id)
              const detail =
                s.state === 'reimbursed'
                  ? drawNames
                  : [`${fmt(s.outstanding)} owed`, drawNames].filter(Boolean).join(' · ')
              return (
                <button
                  type="button"
                  className="expense-status-cell"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'inherit' }}
                  onClick={() => setReimbursing(expense)}
                  aria-label={`Reimbursement for ${expense.vendorName || 'expense'}: ${label}${detail ? `, ${detail}` : ''}`}
                >
                  <Badge tone={tone}>{label}</Badge>
                  {detail && <span className="expense-due">{detail}</span>}
                </button>
              )
            },
          },
        ] as DataColumn<Expense>[])
      : []),
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'center',
      className: 'table-actions-cell',
      cell: (expense) => (
        <button type="button" className="table-icon-action danger-action" onClick={() => removeAndSync(expense)} aria-label={`Delete ${expense.vendorName || 'expense'}`}>
          <Trash2 size={17} aria-hidden />
        </button>
      ),
    },
  ]

  return (
    <>
      <SummaryStrip
        label="Expense summary"
        metrics={[
          { label: 'Invoiced', value: fmt(total), detail: `${expenses.length} transaction${expenses.length === 1 ? '' : 's'}` },
          { label: 'Cash paid', value: fmt(paid), detail: total > 0 ? `${Math.round((paid / total) * 100)}% of invoiced` : 'No payments recorded', tone: 'success' },
          { label: 'Open balance', value: fmt(outstanding), detail: `${fmt(payable)} payable now`, tone: outstanding > 0 ? 'warn' : 'default' },
          { label: 'Retainage held', value: fmt(retainage), detail: 'Excluded from payable now' },
        ]}
      />

      {expenses.length > 0 && (
        <div className="expense-workbench-toolbar">
          <SearchField value={q} onChange={setQ} placeholder="Search vendor, invoice, notes, line item" />
          <SegmentedControl<Filter>
            ariaLabel="Filter expenses"
            value={filter}
            onChange={setFilter}
            segments={[
              { value: 'all', label: 'All' },
              { value: 'open', label: 'Open' },
              { value: 'paid', label: 'Paid' },
              { value: 'unassigned', label: 'Unassigned' },
            ]}
          />
          <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
            Add expense
          </Button>
          <span className="result-count" aria-live="polite">
            {visible.length} of {expenses.length} expenses
          </span>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={ReceiptIcon}
          title={expenses.length === 0 ? 'No expenses yet' : 'Nothing here'}
          body={
            expenses.length === 0
              ? 'Log invoices, receipts, and payments to track spend against your budget.'
              : 'No expenses match the current search or filter.'
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
        <DataTable<Expense>
          caption="Expenses and payment status"
          rows={visible}
          columns={columns}
          getRowKey={(expense) => expense.id}
          sort={sort}
          onSort={setSort}
          rowClassName={() => 'expense-row'}
        />
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
            onPostSaveError={() =>
              toast.error('Expense saved, but budget totals could not refresh. Reopen Budget to reconcile them.')
            }
            onDone={editor.close}
          />
        )}
      </EditorSheet>

      <Sheet
        open={reimbursing !== null}
        onClose={() => setReimbursing(null)}
        title={`Reimburse ${reimbursing?.vendorName || 'expense'}`}
      >
        {reimbursing && (
          <ReimburseSheet
            projectId={projectId}
            expense={reimbursing}
            draws={draws}
            disbursements={disbursements}
            allocations={allocations}
            onDone={() => setReimbursing(null)}
          />
        )}
      </Sheet>
    </>
  )
}
