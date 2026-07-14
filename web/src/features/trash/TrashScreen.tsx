import { Trash2, RotateCcw } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRows } from '../../data/hooks'
import { table } from '../../data/table'
import { fmtDate } from '../../lib/date'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useCurrentProject } from '../projects/currentProject'
import type { AllowanceSelection, BudgetLineItem, ChangeOrder, Expense } from '../../domain/types'
import { useExpenses } from '../expenses/useExpenses'
import { useChangeOrders } from '../changeOrders/useChangeOrders'
import { useAllowances } from '../allowances/useAllowances'
import { useSyncActuals } from '../budget/useSyncActuals'
import { useLineItems } from '../budget/useBudget'

type TrashRow = { id: string; deletedAt?: string | null } & Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' ? v : '')

export function TrashScreen() {
  const { projectId } = useCurrentProject()
  const f = { projectId }
  const only = { trashed: 'only' as const }

  // One trashed-only query per child table (hooks must be unconditional/top-level).
  const cats = useRows<TrashRow>('budget_categories', f, only)
  const items = useRows<TrashRow>('budget_line_items', f, only)
  const expenses = useRows<TrashRow>('expenses', f, only)
  const vendors = useRows<TrashRow>('vendors', f, only)
  const cos = useRows<TrashRow>('change_orders', f, only)
  const allowances = useRows<TrashRow>('allowance_selections', f, only)
  const photos = useRows<TrashRow>('photo_attachments', f, only)
  const docs = useRows<TrashRow>('project_documents', f, only)
  const tasks = useRows<TrashRow>('project_tasks', f, only)
  const pkgs = useRows<TrashRow>('bid_packages', f, only)
  const bids = useRows<TrashRow>('bids', f, only)
  const loans = useRows<TrashRow>('construction_loans', f, only)
  const draws = useRows<TrashRow>('loan_draws', f, only)
  const phases = useRows<TrashRow>('phases', f, only)
  const waivers = useRows<TrashRow>('lien_waivers', f, only)

  // These active lists share the same React Query cache used elsewhere. They let a restored
  // financial row be reconciled immediately instead of leaving stored line-item actuals stale.
  const activeExpensesQuery = useExpenses(projectId!)
  const activeChangeOrdersQuery = useChangeOrders(projectId!)
  const activeAllowancesQuery = useAllowances(projectId!)
  const activeLineItemsQuery = useLineItems(projectId!)
  const activeExpenses = activeExpensesQuery.data ?? []
  const activeChangeOrders = activeChangeOrdersQuery.data ?? []
  const activeAllowances = activeAllowancesQuery.data ?? []
  const activeLineItems = activeLineItemsQuery.data ?? []
  const syncActuals = useSyncActuals(projectId!)

  const qc = useQueryClient()
  const restore = useMutation({
    mutationFn: ({ name, id }: { name: string; id: string }) => table<TrashRow>(name).restore(id),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [v.name] }),
  })
  const purge = useMutation({
    mutationFn: ({ name, id }: { name: string; id: string }) => table(name).purge(id),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [v.name] }),
  })
  const toast = useToast()
  const confirm = useConfirm()

  const groups: { name: string; label: string; rows: TrashRow[]; title: (r: TrashRow) => string }[] = [
    { name: 'budget_categories', label: 'Categories', rows: cats.data ?? [], title: (r) => str(r.name) || 'Category' },
    { name: 'budget_line_items', label: 'Line items', rows: items.data ?? [], title: (r) => str(r.title) || 'Line item' },
    { name: 'expenses', label: 'Expenses', rows: expenses.data ?? [], title: (r) => str(r.vendorName) || 'Expense' },
    { name: 'vendors', label: 'Vendors', rows: vendors.data ?? [], title: (r) => str(r.name) || 'Vendor' },
    { name: 'change_orders', label: 'Change orders', rows: cos.data ?? [], title: (r) => str(r.title) || 'Change order' },
    { name: 'allowance_selections', label: 'Allowance selections', rows: allowances.data ?? [], title: (r) => str(r.vendor) || 'Selection' },
    { name: 'photo_attachments', label: 'Photos', rows: photos.data ?? [], title: (r) => str(r.notes) || str(r.roomTag) || 'Photo' },
    { name: 'project_documents', label: 'Documents', rows: docs.data ?? [], title: (r) => str(r.fileName) || 'Document' },
    { name: 'project_tasks', label: 'Tasks', rows: tasks.data ?? [], title: (r) => str(r.title) || 'Task' },
    { name: 'bid_packages', label: 'Bid packages', rows: pkgs.data ?? [], title: (r) => str(r.scopeTitle) || 'Bid package' },
    { name: 'bids', label: 'Bids', rows: bids.data ?? [], title: (r) => str(r.vendorName) || 'Bid' },
    { name: 'construction_loans', label: 'Loans', rows: loans.data ?? [], title: (r) => str(r.lender) || 'Construction loan' },
    { name: 'loan_draws', label: 'Loan draws', rows: draws.data ?? [], title: (r) => str(r.description) || 'Draw' },
    { name: 'phases', label: 'Build phases', rows: phases.data ?? [], title: (r) => str(r.name) || 'Phase' },
    { name: 'lien_waivers', label: 'Lien waivers', rows: waivers.data ?? [], title: (r) => str(r.vendorName) || 'Lien waiver' },
  ]

  const queries = [
    cats,
    items,
    expenses,
    vendors,
    cos,
    allowances,
    photos,
    docs,
    tasks,
    pkgs,
    bids,
    loans,
    draws,
    phases,
    waivers,
    activeExpensesQuery,
    activeChangeOrdersQuery,
    activeAllowancesQuery,
    activeLineItemsQuery,
  ]
  const isLoading = queries.some((q) => q.isLoading)
  const error = queries.find((q) => q.error)?.error
  const total = groups.reduce((n, g) => n + g.rows.length, 0)

  const onRestore = async (name: string, row: TrashRow) => {
    try {
      await restore.mutateAsync({ name, id: row.id })
    } catch (error) {
      toast.error(`Couldn’t restore: ${(error as Error).message}`)
      return
    }

    const restored: TrashRow = { ...row, deletedAt: null }
    try {
      if (name === 'expenses') {
        const expense = restored as unknown as Expense
        await syncActuals({ expenses: [...activeExpenses.filter((item) => item.id !== expense.id), expense] })
      } else if (name === 'change_orders') {
        const order = restored as unknown as ChangeOrder
        await syncActuals({
          changeOrders: [...activeChangeOrders.filter((item) => item.id !== order.id), order],
        })
      } else if (name === 'allowance_selections') {
        const selection = restored as unknown as AllowanceSelection
        await syncActuals({
          allowanceSelections: [...activeAllowances.filter((item) => item.id !== selection.id), selection],
        })
      } else if (name === 'budget_line_items') {
        const lineItem = restored as unknown as BudgetLineItem
        await syncActuals({
          lineItems: [...activeLineItems.filter((item) => item.id !== lineItem.id), lineItem],
        })
      }
      toast.success('Restored')
    } catch {
      // The authoritative restore succeeded. Be explicit that only the derived totals failed,
      // and never invite a second restore attempt for an already-active row.
      toast.error('Restored, but budget totals could not refresh. Reopen Budget to reconcile them.')
    }
  }
  const onPurge = async (name: string, id: string, label: string) => {
    if (!(await confirm({ title: 'Delete forever?', message: `This permanently removes “${label}”. This cannot be undone.`, destructive: true }))) return
    await purge.mutateAsync({ name, id })
    toast.success('Permanently deleted')
  }

  if (!projectId) return null

  return (
    <section>
      <ScreenHeader title="Trash" subtitle="Restore deleted items, or remove them for good" />
      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={total === 0}
        errorLabel="Couldn’t load Trash"
        empty={<EmptyState icon={Trash2} title="Trash is empty" body="Deleted items show up here so you can restore them or delete them for good." />}
      >
        {groups
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <div key={g.name}>
              <h2 className="section-label">{g.label}</h2>
              <ul className="card-list">
                {g.rows.map((r) => (
                  <li key={r.id} className="expense-row">
                    <div className="expense-row-open" style={{ cursor: 'default' }}>
                      <div className="expense-row-main">
                        <strong>{g.title(r)}</strong>
                        {r.deletedAt && <span className="muted">Deleted {fmtDate(r.deletedAt)}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" leadingIcon={<RotateCcw size={14} />} onClick={() => onRestore(g.name, r)}>
                      Restore
                    </Button>
                    <button className="expense-row-del" onClick={() => onPurge(g.name, r.id, g.title(r))} aria-label="Delete forever">
                      <Trash2 size={17} aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </ListState>
    </section>
  )
}
