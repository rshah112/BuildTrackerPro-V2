import { useMemo, useState } from 'react'
import { ChevronDown, Plus, FolderPlus, MoreHorizontal } from 'lucide-react'
import type { BudgetCategory, BudgetLineItem } from '../../domain/types'
import { diff, fmt, sumBy } from '../../lib/money'
import { openCommitment, spentAndCommitted } from '../../lib/budgetMath'
import { categoryFinancialSummary } from '../../lib/financialSummary'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Sheet } from '../../components/ui/Sheet'
import { SearchField } from '../../components/ui/SearchField'
import { DataTable, type DataColumn, type SortState } from '../../components/ui/DataTable'
import { SummaryStrip } from '../../components/ui/SummaryStrip'
import { matchesQuery } from '../../lib/search'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useConfirm } from '../../components/ui/Confirm'
import { useToast } from '../../components/ui/Toast'
import { useRestoreRow } from '../../data/hooks'
import { useCurrentProject } from '../projects/currentProject'
import { useProjects } from '../projects/useProjects'
import { useCategories, useRemoveCategory, useLineItems, useRemoveLineItem, useCreateLineItem } from './useBudget'

/** Allowance items measure against their allowance amount; others against budget. */
function lineLimit(li: BudgetLineItem): number {
  return li.isAllowance ? li.allowanceAmount : li.budget
}
import { CategoryForm } from './CategoryForm'
import { LineItemForm } from './LineItemForm'
import { LineItemDetailSheet } from './LineItemDetailSheet'
import { HealthPill } from './HealthPill'
import { ExpenseList } from '../expenses/ExpenseList'
import { useSyncActuals } from './useSyncActuals'
import { compareCategories, nextCategorySortOrder } from './categoryOrder'

type Tab = 'budget' | 'expenses'
type HealthFilter = 'all' | 'healthy' | 'nearLimit' | 'overBudget'
type CategoryHealth = Exclude<HealthFilter, 'all'>
type CategoryStat = {
  items: BudgetLineItem[]
  budget: number
  actual: number
  committed: number
  exposure: number
  remaining: number
  utilization: number
  health: CategoryHealth
}
type CategoryRow = { category: BudgetCategory; stat: CategoryStat; shownItems: BudgetLineItem[] }
type Editing =
  | { kind: 'newCategory' }
  | { kind: 'editCategory'; cat: BudgetCategory }
  | { kind: 'newLineItem'; categoryName: string }
  | { kind: 'editLineItem'; item: BudgetLineItem }

function pct(actual: number, budget: number): number {
  if (budget <= 0) return 0
  return Math.min(100, Math.max(0, (actual / budget) * 100))
}

const HEALTH_LABEL: Record<CategoryHealth, string> = {
  healthy: 'On track',
  nearLimit: 'Near limit',
  overBudget: 'Over budget',
}

const HEALTH_TONE: Record<CategoryHealth, BadgeTone> = {
  healthy: 'success',
  nearLimit: 'warn',
  overBudget: 'danger',
}

export function BudgetScreen() {
  const { projectId } = useCurrentProject()
  const [tab, setTab] = useState<Tab>('budget')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [detailItem, setDetailItem] = useState<BudgetLineItem | null>(null)
  const [healthFilter, setHealthFilter] = useState<HealthFilter>('all')
  const [sort, setSort] = useState<SortState>({ key: 'category', direction: 'asc' })

  const { data: projects = [], isLoading: projectsLoading, error: projectsError } = useProjects()
  const { data: categories = [], isLoading: catsLoading, error: catsError } = useCategories(projectId!)
  const { data: lineItems = [], isLoading: itemsLoading, error: itemsError } = useLineItems(projectId!)
  const removeCategory = useRemoveCategory()
  const removeLineItem = useRemoveLineItem()
  const createLineItem = useCreateLineItem()
  const restoreCategory = useRestoreRow('budget_categories')
  const restoreLineItem = useRestoreRow('budget_line_items')
  const confirm = useConfirm()
  const toast = useToast()
  const syncActuals = useSyncActuals(projectId!)

  const orderedCategories = useMemo(
    () => [...categories].sort(compareCategories),
    [categories],
  )

  // Group line items by category once (with cent-exact budget/actual totals) instead of
  // re-filtering + re-summing the full list for every category on every render/toggle.
  const categoryStats = useMemo(() => {
    const grouped = new Map<string, BudgetLineItem[]>()
    for (const li of lineItems) {
      const arr = grouped.get(li.categoryName)
      if (arr) arr.push(li)
      else grouped.set(li.categoryName, [li])
    }
    const out = new Map<string, CategoryStat>()
    for (const [name, arr] of grouped) {
      const items = [...arr].sort(
        (a, b) =>
          Number(b.isPinned) - Number(a.isPinned) ||
          a.costCode.localeCompare(b.costCode, undefined, { numeric: true }) ||
          a.title.localeCompare(b.title, undefined, { numeric: true }),
      )
      const finance = categoryFinancialSummary(name, items)
      out.set(name, {
        items,
        budget: finance.effectiveBudget,
        actual: finance.actual,
        committed: finance.openCommitment,
        exposure: finance.exposure,
        remaining: finance.remaining,
        utilization: finance.utilization,
        health: finance.status,
      })
    }
    return out
  }, [lineItems])

  const summary = useMemo(() => {
    const planned = sumBy(lineItems, lineLimit)
    const actual = sumBy(lineItems, (item) => item.actual)
    const committed = sumBy(lineItems, openCommitment)
    const exposure = sumBy(lineItems, spentAndCommitted)
    const project = projects.find((candidate) => candidate.id === projectId)
    const authorized = project?.constructionBudget ?? planned
    return {
      authorized,
      planned,
      actual,
      committed,
      exposure,
      remaining: diff(authorized, exposure),
      unallocated: diff(authorized, planned),
      used: authorized > 0 ? exposure / authorized : 0,
    }
  }, [lineItems, projects, projectId])

  const deleteCategory = async (cat: BudgetCategory, itemCount: number) => {
    if (itemCount > 0) {
      toast.show(`Remove this category’s ${itemCount} line item${itemCount === 1 ? '' : 's'} before deleting it.`)
      return
    }
    if (await confirm({ title: 'Delete category?', message: `“${cat.name}” will be moved to Trash.`, destructive: true })) {
      await removeCategory.mutateAsync(cat.id)
      toast.success('Category moved to Trash', { action: { label: 'Undo', onClick: () => restoreCategory.mutate(cat.id) } })
    }
  }
  const duplicateLineItem = async (li: BudgetLineItem) => {
    const copy: Partial<BudgetLineItem> = {
      projectId: li.projectId,
      categoryName: li.categoryName,
      costCode: li.costCode,
      title: `${li.title} (copy)`,
      roomTag: li.roomTag,
      budget: li.budget,
      committed: li.committed,
      actual: 0, // a fresh planned item has no spend yet (recomputed from expenses)
      notes: li.notes,
      isPinned: false,
      isAllowance: li.isAllowance,
      allowanceAmount: li.allowanceAmount,
    }
    await createLineItem.mutateAsync(copy)
    await syncActuals()
    toast.success('Line item duplicated')
  }
  const deleteLineItem = async (li: BudgetLineItem) => {
    if (await confirm({ title: 'Delete line item?', message: `“${li.title}” will be moved to Trash.`, destructive: true })) {
      await removeLineItem.mutateAsync(li.id)
      await syncActuals()
      toast.success('Line item moved to Trash', {
        action: {
          label: 'Undo',
          onClick: async () => {
            await restoreLineItem.mutateAsync(li.id)
            await syncActuals()
          },
        },
      })
    }
  }

  if (!projectId) return null
  const loadError = catsError || itemsError || projectsError
  if (loadError)
    return (
      <p role="alert" className="error-banner">
        Couldn’t load budget: {(loadError as Error).message}
      </p>
    )
  if (catsLoading || itemsLoading || projectsLoading) return <ListSkeleton />

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const close = () => setEditing(null)

  const searching = q.trim() !== ''
  const itemMatches = (li: BudgetLineItem) => matchesQuery(q, li.title, li.costCode, li.notes, li.roomTag)
  const emptyStat: CategoryStat = {
    items: [],
    budget: 0,
    actual: 0,
    committed: 0,
    exposure: 0,
    remaining: 0,
    utilization: 0,
    health: 'healthy',
  }
  const shownRows: CategoryRow[] = orderedCategories
    .map((category) => {
      const stat = categoryStats.get(category.name) ?? emptyStat
      return {
        category,
        stat,
        shownItems: searching ? stat.items.filter(itemMatches) : stat.items,
      }
    })
    .filter(({ category, stat }) => {
      const matches = !searching || matchesQuery(q, category.name) || stat.items.some(itemMatches)
      const hasHealth = healthFilter === 'all' || stat.health === healthFilter
      return matches && hasHealth
    })
    .sort((a, b) => {
      const direction = sort.direction === 'asc' ? 1 : -1
      const numeric = (value: (row: CategoryRow) => number) =>
        (value(a) - value(b)) * direction || a.category.name.localeCompare(b.category.name)
      if (sort.key === 'budget') return numeric((row) => row.stat.budget)
      if (sort.key === 'actual') return numeric((row) => row.stat.actual)
      if (sort.key === 'committed') return numeric((row) => row.stat.committed)
      if (sort.key === 'exposure') return numeric((row) => row.stat.exposure)
      if (sort.key === 'remaining') return numeric((row) => row.stat.remaining)
      if (sort.key === 'used') return numeric((row) => row.stat.utilization)
      if (sort.key === 'status') {
        const rank = { overBudget: 2, nearLimit: 1, healthy: 0 }
        return (rank[a.stat.health] - rank[b.stat.health]) * direction
      }
      return a.category.name.localeCompare(b.category.name) * direction
    })

  const categoryColumns: DataColumn<CategoryRow>[] = [
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      className: 'budget-primary-cell',
      cell: ({ category, stat }) => {
        const open = searching || expanded.has(category.id)
        return (
          <button
            type="button"
            className="budget-category-toggle"
            onClick={() => toggle(category.id)}
            aria-expanded={open}
          >
            <ChevronDown className={`budget-cat-caret${open ? ' is-open' : ''}`} size={18} aria-hidden />
            <span>
              <strong>{category.name}</strong>
              <small>
                {stat.items.length} line item{stat.items.length === 1 ? '' : 's'}
                {category.targetBudget > 0 ? ` · ${fmt(category.targetBudget)} target` : ''}
              </small>
            </span>
          </button>
        )
      },
    },
    { key: 'budget', header: 'Budget', mobileLabel: 'Budget', sortable: true, align: 'end', cell: ({ stat }) => fmt(stat.budget) },
    { key: 'actual', header: 'Incurred', mobileLabel: 'Incurred', sortable: true, align: 'end', cell: ({ stat }) => fmt(stat.actual) },
    { key: 'committed', header: 'Open commit.', mobileLabel: 'Open commitment', sortable: true, align: 'end', cell: ({ stat }) => fmt(stat.committed) },
    { key: 'exposure', header: 'Exposure', mobileLabel: 'Exposure', sortable: true, align: 'end', cell: ({ stat }) => <strong>{fmt(stat.exposure)}</strong> },
    {
      key: 'remaining',
      header: 'Remaining',
      mobileLabel: 'Remaining',
      sortable: true,
      align: 'end',
      cell: ({ stat }) => <span className={stat.remaining < 0 ? 'danger-text' : undefined}>{fmt(stat.remaining)}</span>,
    },
    {
      key: 'used',
      header: 'Used',
      mobileLabel: 'Used',
      sortable: true,
      align: 'end',
      className: 'budget-used-cell',
      cell: ({ stat }) => (
        <div className="table-progress">
          <span>{Math.round(stat.utilization * 100)}%</span>
          <div className="progress thin" aria-hidden>
            <span className={`fill-${stat.health}`} style={{ width: `${pct(stat.exposure, stat.budget)}%` }} />
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      mobileLabel: 'Status',
      sortable: true,
      cell: ({ stat }) => <Badge tone={HEALTH_TONE[stat.health]}>{HEALTH_LABEL[stat.health]}</Badge>,
    },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'center',
      className: 'table-actions-cell',
      cell: ({ category, stat }) => (
        <details className="row-menu">
          <summary aria-label={`Actions for ${category.name}`}>
            <MoreHorizontal size={18} aria-hidden />
          </summary>
          <div className="row-menu-popover">
            <button type="button" onClick={() => setEditing({ kind: 'newLineItem', categoryName: category.name })}>Add line item</button>
            <button type="button" onClick={() => setEditing({ kind: 'editCategory', cat: category })}>Edit category</button>
            <button type="button" className="danger-text" onClick={() => deleteCategory(category, stat.items.length)}>Delete category</button>
          </div>
        </details>
      ),
    },
  ]

  return (
    <section>
      <ScreenHeader
        title="Budget"
        trailing={
          tab === 'budget' && categories.length > 0 ? (
            <Button
              size="sm"
              leadingIcon={<Plus size={16} />}
              onClick={() => setEditing({ kind: 'newCategory' })}
            >
              Add category
            </Button>
          ) : undefined
        }
      />

      <SegmentedControl<Tab>
        ariaLabel="Budget view"
        value={tab}
        onChange={setTab}
        segments={[
          { value: 'budget', label: 'Categories' },
          { value: 'expenses', label: 'Expenses' },
        ]}
      />

      {tab === 'budget' && (
        <div className="tab-panel">
          {categories.length === 0 ? (
            <EmptyState
              icon={FolderPlus}
              title="No categories yet"
              body="Group your budget into categories like Sitework, Foundation, or Finishes."
              action={
                <Button leadingIcon={<Plus size={16} />} onClick={() => setEditing({ kind: 'newCategory' })}>
                  Add category
                </Button>
              }
            />
          ) : (
            <>
              <SummaryStrip
                label="Budget summary"
                metrics={[
                  {
                    label: 'Construction budget',
                    value: fmt(summary.authorized),
                    detail: `${fmt(summary.unallocated)} unallocated`,
                    tone: summary.unallocated < 0 ? 'warn' : 'default',
                  },
                  { label: 'Incurred', value: fmt(summary.actual), detail: 'Recorded actual cost' },
                  { label: 'Open commitments', value: fmt(summary.committed), detail: 'Committed, not yet incurred' },
                  { label: 'Current exposure', value: fmt(summary.exposure), detail: 'Incurred + open commitments' },
                  {
                    label: 'Remaining',
                    value: fmt(summary.remaining),
                    detail: `${Math.round(summary.used * 100)}% of construction budget used`,
                    tone: summary.remaining < 0 ? 'danger' : summary.used >= 0.9 ? 'warn' : 'success',
                  },
                ]}
              />

              <div className="workbench-toolbar">
                <SearchField value={q} onChange={setQ} placeholder="Search line items, cost code, notes" />
                <label className="filter-select">
                  <span className="sr-only">Filter budget status</span>
                  <select value={healthFilter} onChange={(event) => setHealthFilter(event.target.value as HealthFilter)}>
                    <option value="all">All statuses</option>
                    <option value="healthy">On track</option>
                    <option value="nearLimit">Near limit</option>
                    <option value="overBudget">Over budget</option>
                  </select>
                </label>
                <span className="result-count" aria-live="polite">
                  {shownRows.length} of {categories.length} categories
                </span>
              </div>

              {shownRows.length === 0 ? (
                <div className="table-empty">
                  <strong>No budget items found</strong>
                  <p>Try a different search or status filter.</p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setQ('')
                      setHealthFilter('all')
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <DataTable<CategoryRow>
                  caption="Budget categories"
                  rows={shownRows}
                  columns={categoryColumns}
                  getRowKey={(row) => row.category.id}
                  sort={sort}
                  onSort={setSort}
                  rowClassName={() => 'budget-cat'}
                  isExpanded={(row) => searching || expanded.has(row.category.id)}
                  expandedRow={({ category, shownItems }) => (
                    <div className="budget-line-panel">
                      <div className="budget-line-panel-head">
                        <div>
                          <strong>{category.name} line items</strong>
                          <span className="muted">Drill into cost-code performance and commitments.</span>
                        </div>
                        <Button
                          size="sm"
                          variant="secondary"
                          leadingIcon={<Plus size={15} />}
                          onClick={() => setEditing({ kind: 'newLineItem', categoryName: category.name })}
                        >
                          Add line item
                        </Button>
                      </div>
                      {shownItems.length === 0 ? (
                        <p className="lineitem-empty muted">
                          {searching ? 'No line items in this category match your search.' : 'No line items yet.'}
                        </p>
                      ) : (
                        <div className="budget-line-table-wrap">
                          <table className="data-table budget-line-table">
                            <caption className="sr-only">{category.name} line items</caption>
                            <thead>
                              <tr>
                                <th scope="col">Cost item</th>
                                <th scope="col" className="cell-number">Budget</th>
                                <th scope="col" className="cell-number">Incurred</th>
                                <th scope="col" className="cell-number">Open commit.</th>
                                <th scope="col" className="cell-number">Exposure</th>
                                <th scope="col" className="cell-number">Remaining</th>
                                <th scope="col">Status</th>
                                <th scope="col"><span className="sr-only">Actions</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {shownItems.map((item) => {
                                const limit = lineLimit(item)
                                const itemOpen = openCommitment(item)
                                const exposure = spentAndCommitted(item)
                                const itemRemaining = diff(limit, exposure)
                                return (
                                  <tr key={item.id} className="lineitem">
                                    <td className="lineitem-primary">
                                      <button type="button" className="lineitem-title lineitem-title-btn" onClick={() => setDetailItem(item)}>
                                        <strong>{item.title}</strong>
                                        <span>
                                          {item.costCode || 'No cost code'}
                                          {item.isAllowance ? ' · Allowance' : ''}
                                        </span>
                                      </button>
                                    </td>
                                    <td data-label="Budget" className="cell-number">{fmt(limit)}</td>
                                    <td data-label="Incurred" className="cell-number">{fmt(item.actual)}</td>
                                    <td data-label="Open commitment" className="cell-number">{fmt(itemOpen)}</td>
                                    <td data-label="Exposure" className="cell-number"><strong>{fmt(exposure)}</strong></td>
                                    <td data-label="Remaining" className="cell-number">
                                      <span className={itemRemaining < 0 ? 'danger-text' : undefined}>{fmt(itemRemaining)}</span>
                                    </td>
                                    <td data-label="Status"><HealthPill item={item} /></td>
                                    <td className="table-actions-cell">
                                      <details className="row-menu">
                                        <summary aria-label={`Actions for ${item.title}`}><MoreHorizontal size={18} aria-hidden /></summary>
                                        <div className="row-menu-popover">
                                          <button type="button" onClick={() => setEditing({ kind: 'editLineItem', item })}>Edit</button>
                                          <button type="button" onClick={() => duplicateLineItem(item)}>Duplicate</button>
                                          <button type="button" className="danger-text" onClick={() => deleteLineItem(item)}>Delete</button>
                                        </div>
                                      </details>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                />
              )}
            </>
          )}
        </div>
      )}

      {tab === 'expenses' && (
        <div className="tab-panel">
          <ExpenseList projectId={projectId} lineItems={lineItems} />
        </div>
      )}

      <Sheet
        open={editing !== null}
        onClose={close}
        title={
          editing?.kind === 'newCategory'
            ? 'New category'
            : editing?.kind === 'editCategory'
              ? 'Edit category'
              : editing?.kind === 'newLineItem'
                ? 'New line item'
                : 'Edit line item'
        }
      >
        {(editing?.kind === 'newCategory' || editing?.kind === 'editCategory') && (
          <CategoryForm
            projectId={projectId}
            initial={editing.kind === 'editCategory' ? editing.cat : undefined}
            nextSortOrder={nextCategorySortOrder(categories)}
            onDone={close}
          />
        )}
        {(editing?.kind === 'newLineItem' || editing?.kind === 'editLineItem') && (
          <LineItemForm
            projectId={projectId}
            categoryName={editing.kind === 'newLineItem' ? editing.categoryName : editing.item.categoryName}
            initial={editing.kind === 'editLineItem' ? editing.item : undefined}
            onDone={close}
          />
        )}
      </Sheet>

      {detailItem && (
        <LineItemDetailSheet
          item={detailItem}
          onClose={() => setDetailItem(null)}
          onEdit={() => {
            setEditing({ kind: 'editLineItem', item: detailItem })
            setDetailItem(null)
          }}
          onDuplicate={() => {
            void duplicateLineItem(detailItem)
            setDetailItem(null)
          }}
        />
      )}
    </section>
  )
}
