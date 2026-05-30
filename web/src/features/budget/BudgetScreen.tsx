import { useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2, FolderPlus } from 'lucide-react'
import type { BudgetCategory, BudgetLineItem } from '../../domain/types'
import { fmt, sumBy } from '../../lib/money'
import { lineItemHealth } from '../../lib/budgetMath'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { EmptyState } from '../../components/ui/Feedback'
import { useCurrentProject } from '../projects/currentProject'
import { useCategories, useRemoveCategory, useLineItems, useRemoveLineItem } from './useBudget'
import { CategoryForm } from './CategoryForm'
import { LineItemForm } from './LineItemForm'
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

  const { data: categories = [], isLoading: catsLoading } = useCategories(projectId!)
  const { data: lineItems = [], isLoading: itemsLoading } = useLineItems(projectId!)
  const removeCategory = useRemoveCategory()
  const removeLineItem = useRemoveLineItem()

  if (!projectId) return null
  if (catsLoading || itemsLoading) return <div className="loading">Loading budget…</div>

  const itemsByCategory = (catName: string) => lineItems.filter((li) => li.categoryName === catName)

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const close = () => setEditing(null)

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
        <div style={{ marginTop: '1rem' }}>
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
            <ul className="card-list">
              {categories.map((cat) => {
                const items = itemsByCategory(cat.name)
                const budget = sumBy(items, (i) => i.budget)
                const actual = sumBy(items, (i) => i.actual)
                const open = expanded.has(cat.id)
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
                        disabled={items.length > 0}
                        onClick={() => removeCategory.mutate(cat.id)}
                      >
                        Delete
                      </Button>
                    </div>

                    {open && (
                      <ul className="lineitem-list">
                        {items.length === 0 && <li className="muted lineitem-empty">No line items yet.</li>}
                        {items.map((li) => {
                          const health = lineItemHealth(li)
                          return (
                            <li key={li.id} className="lineitem">
                              <div className="lineitem-row">
                                <div className="lineitem-title">
                                  <strong>{li.title}</strong>
                                  {li.costCode && <span className="muted"> · {li.costCode}</span>}
                                </div>
                                <HealthPill item={li} />
                              </div>
                              <div className="progress thin">
                                <span className={`fill-${health}`} style={{ width: `${pct(li.actual, li.budget)}%` }} />
                              </div>
                              <div className="lineitem-foot">
                                <span className="muted">
                                  {fmt(li.actual)} / {fmt(li.budget)}
                                </span>
                                <span className="lineitem-acts">
                                  <Button size="sm" variant="ghost" onClick={() => setEditing({ kind: 'editLineItem', item: li })}>
                                    Edit
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => removeLineItem.mutate(li.id)}>
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
          )}
        </div>
      )}

      {tab === 'expenses' && (
        <div style={{ marginTop: '1rem' }}>
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
    </section>
  )
}
