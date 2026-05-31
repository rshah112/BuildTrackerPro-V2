import { useMemo, useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2, FolderPlus } from 'lucide-react'
import type { BudgetCategory, BudgetLineItem } from '../../domain/types'
import { fmt, sumBy } from '../../lib/money'
import { lineItemHealth } from '../../lib/budgetMath'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { SearchField } from '../../components/ui/SearchField'
import { matchesQuery } from '../../lib/search'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useConfirm } from '../../components/ui/Confirm'
import { useToast } from '../../components/ui/Toast'
import { useRestoreRow } from '../../data/hooks'
import { useCurrentProject } from '../projects/currentProject'
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

type Tab = 'budget' | 'expenses'
type Editing =
  | { kind: 'newCategory' }
  | { kind: 'editCategory'; cat: BudgetCategory }
  | { kind: 'newLineItem'; categoryName: string }
  | { kind: 'editLineItem'; item: BudgetLineItem }

function pct(actual: number, budget: number): number {
  if (budget <= 0) return 0
  return Math.min(100, Math.max(0, (actual / budget) * 100))
}

export function BudgetScreen() {
  const { projectId } = useCurrentProject()
  const [tab, setTab] = useState<Tab>('budget')
  const [editing, setEditing] = useState<Editing | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [detailItem, setDetailItem] = useState<BudgetLineItem | null>(null)

  const { data: categories = [], isLoading: catsLoading, error: catsError } = useCategories(projectId!)
  const { data: lineItems = [], isLoading: itemsLoading, error: itemsError } = useLineItems(projectId!)
  const removeCategory = useRemoveCategory()
  const removeLineItem = useRemoveLineItem()
  const createLineItem = useCreateLineItem()
  const restoreCategory = useRestoreRow('budget_categories')
  const restoreLineItem = useRestoreRow('budget_line_items')
  const confirm = useConfirm()
  const toast = useToast()

  // Group line items by category once (with cent-exact budget/actual totals) instead of
  // re-filtering + re-summing the full list for every category on every render/toggle.
  const categoryStats = useMemo(() => {
    const grouped = new Map<string, BudgetLineItem[]>()
    for (const li of lineItems) {
      const arr = grouped.get(li.categoryName)
      if (arr) arr.push(li)
      else grouped.set(li.categoryName, [li])
    }
    const out = new Map<string, { items: BudgetLineItem[]; budget: number; actual: number }>()
    for (const [name, arr] of grouped) {
      out.set(name, { items: arr, budget: sumBy(arr, (i) => i.budget), actual: sumBy(arr, (i) => i.actual) })
    }
    return out
  }, [lineItems])

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
    toast.success('Line item duplicated')
  }
  const deleteLineItem = async (li: BudgetLineItem) => {
    if (await confirm({ title: 'Delete line item?', message: `“${li.title}” will be moved to Trash.`, destructive: true })) {
      await removeLineItem.mutateAsync(li.id)
      toast.success('Line item moved to Trash', { action: { label: 'Undo', onClick: () => restoreLineItem.mutate(li.id) } })
    }
  }

  if (!projectId) return null
  const loadError = catsError || itemsError
  if (loadError)
    return (
      <p role="alert" className="error-banner">
        Couldn’t load budget: {(loadError as Error).message}
      </p>
    )
  if (catsLoading || itemsLoading) return <ListSkeleton />

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
  const shownCats = searching
    ? categories.filter(
        (cat) => matchesQuery(q, cat.name) || (categoryStats.get(cat.name)?.items ?? []).some(itemMatches),
      )
    : categories

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
            {categories.length > 2 && <SearchField value={q} onChange={setQ} placeholder="Search line items, cost code, notes" />}
            {searching && shownCats.length === 0 && <p className="muted">No budget items match “{q}”.</p>}
            <ul className="card-list">
              {shownCats.map((cat) => {
                const stat = categoryStats.get(cat.name) ?? { items: [], budget: 0, actual: 0 }
                const { items, budget, actual } = stat
                const shownItems = searching ? items.filter(itemMatches) : items
                const open = searching || expanded.has(cat.id)
                const over = actual > budget && budget > 0
                return (
                  <li key={cat.id} className="budget-cat">
                    <button className="budget-cat-head" onClick={() => toggle(cat.id)} aria-expanded={open}>
                      <ChevronDown
                        className={`budget-cat-caret${open ? ' is-open' : ''}`}
                        size={18}
                        aria-hidden
                      />
                      <div className="budget-cat-info">
                        <div className="budget-cat-titlerow">
                          <strong>{cat.name}</strong>
                          <span className="muted">{items.length}</span>
                        </div>
                        <div className="budget-cat-figures">
                          <span className={over ? 'danger-text' : 'muted'}>
                            {fmt(actual)} <span className="muted">/ {fmt(budget)}</span>
                          </span>
                          {cat.targetBudget > 0 && (
                            <span className="muted"> · target {fmt(cat.targetBudget)}</span>
                          )}
                        </div>
                        <div className="progress thin">
                          <span
                            className={over ? 'fill-danger' : 'fill-brand'}
                            style={{ width: `${pct(actual, budget)}%` }}
                          />
                        </div>
                      </div>
                    </button>

                    <div className="budget-cat-actions">
                      <Button size="sm" variant="ghost" leadingIcon={<Pencil size={14} />} onClick={() => setEditing({ kind: 'editCategory', cat })}>
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Plus size={14} />}
                        onClick={() => setEditing({ kind: 'newLineItem', categoryName: cat.name })}
                      >
                        + Line item
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        leadingIcon={<Trash2 size={14} />}
                        title={
                          items.length > 0
                            ? 'Remove this category’s line items before deleting it'
                            : undefined
                        }
                        onClick={() => deleteCategory(cat, items.length)}
                      >
                        Delete
                      </Button>
                    </div>

                    {open && (
                      <ul className="lineitem-list">
                        {shownItems.length === 0 && <li className="muted lineitem-empty">No line items yet.</li>}
                        {shownItems.map((li) => {
                          const health = lineItemHealth(li)
                          return (
                            <li key={li.id} className="lineitem">
                              <div className="lineitem-row">
                                <button type="button" className="lineitem-title lineitem-title-btn" onClick={() => setDetailItem(li)}>
                                  <strong>{li.title}</strong>
                                  {li.costCode && <span className="muted"> · {li.costCode}</span>}
                                </button>
                                <HealthPill item={li} />
                              </div>
                              <div className="progress thin">
                                <span className={`fill-${health}`} style={{ width: `${pct(li.actual, lineLimit(li))}%` }} />
                              </div>
                              <div className="lineitem-foot">
                                <span className="muted">
                                  {fmt(li.actual)} / {fmt(lineLimit(li))}
                                  {li.isAllowance && <span className="muted"> · allowance</span>}
                                </span>
                                <span className="lineitem-acts">
                                  <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'editLineItem', item: li })}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => duplicateLineItem(li)}>
                                    Duplicate
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => deleteLineItem(li)}>
                                    Delete
                                  </Button>
                                </span>
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
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
