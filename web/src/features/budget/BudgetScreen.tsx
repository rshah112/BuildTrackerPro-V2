import { useState } from 'react'
import type { BudgetCategory, BudgetLineItem } from '../../domain/types'
import { useCurrentProject } from '../projects/currentProject'
import { useCategories, useRemoveCategory, useLineItems, useRemoveLineItem } from './useBudget'
import { CategoryForm } from './CategoryForm'
import { LineItemForm } from './LineItemForm'
import { HealthPill } from './HealthPill'
import { ExpenseList } from '../expenses/ExpenseList'
import { fmt } from '../../lib/money'

type Tab = 'budget' | 'expenses'
type Editing =
  | { kind: 'newCategory' }
  | { kind: 'editCategory'; cat: BudgetCategory }
  | { kind: 'newLineItem'; categoryName: string }
  | { kind: 'editLineItem'; item: BudgetLineItem }

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

  if (editing) {
    const close = () => setEditing(null)
    if (editing.kind === 'newCategory' || editing.kind === 'editCategory')
      return (
        <section>
          <h1>{editing.kind === 'newCategory' ? 'New category' : 'Edit category'}</h1>
          <CategoryForm
            projectId={projectId}
            initial={editing.kind === 'editCategory' ? editing.cat : undefined}
            onDone={close}
          />
        </section>
      )
    return (
      <section>
        <h1>{editing.kind === 'newLineItem' ? 'New line item' : 'Edit line item'}</h1>
        <LineItemForm
          projectId={projectId}
          categoryName={editing.kind === 'newLineItem' ? editing.categoryName : editing.item.categoryName}
          initial={editing.kind === 'editLineItem' ? editing.item : undefined}
          onDone={close}
        />
      </section>
    )
  }

  return (
    <section>
      <h1>Budget</h1>

      <div className="sub-tabs" role="tablist">
        <button
          role="tab"
          aria-selected={tab === 'budget'}
          className={tab === 'budget' ? 'sub-tab active' : 'sub-tab'}
          onClick={() => setTab('budget')}
        >
          Categories
        </button>
        <button
          role="tab"
          aria-selected={tab === 'expenses'}
          className={tab === 'expenses' ? 'sub-tab active' : 'sub-tab'}
          onClick={() => setTab('expenses')}
        >
          Expenses
        </button>
      </div>

      {tab === 'budget' && (
        <>
          <div className="row-between" style={{ marginTop: '1rem' }}>
            <span>{categories.length} {categories.length === 1 ? 'category' : 'categories'}</span>
            <button onClick={() => setEditing({ kind: 'newCategory' })}>Add category</button>
          </div>

          {categories.length === 0 && <p>No categories yet — add your first one.</p>}

          <ul className="card-list">
            {categories.map((cat) => {
              const items = itemsByCategory(cat.name)
              const open = expanded.has(cat.id)
              return (
                <li key={cat.id} className="card">
                  <div className="row-between">
                    <button className="link" onClick={() => toggle(cat.id)}>
                      <strong>{cat.name}</strong>
                      {cat.targetBudget > 0 && (
                        <span className="muted"> · {fmt(cat.targetBudget)} budget</span>
                      )}
                      <span className="muted"> ({items.length})</span>
                    </button>
                    <div className="card-actions">
                      <button className="secondary" onClick={() => setEditing({ kind: 'editCategory', cat })}>Edit</button>
                      <button
                        className="secondary"
                        onClick={() => setEditing({ kind: 'newLineItem', categoryName: cat.name })}
                      >
                        + Line item
                      </button>
                      <button
                        className="danger"
                        onClick={() => removeCategory.mutate(cat.id)}
                        disabled={items.length > 0}
                        title={items.length > 0 ? 'Remove all line items first' : undefined}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {open && (
                    <ul className="nested-list">
                      {items.length === 0 && <li className="muted">No line items yet.</li>}
                      {items.map((li) => (
                        <li key={li.id} className="nested-item">
                          <div className="row-between">
                            <span>
                              <strong>{li.title}</strong>
                              {li.costCode && <span className="muted"> · {li.costCode}</span>}
                            </span>
                            <div className="card-actions">
                              <HealthPill item={li} />
                              <span className="muted">{fmt(li.budget)} budget</span>
                              <span className="muted">{fmt(li.actual)} actual</span>
                              <button className="secondary" onClick={() => setEditing({ kind: 'editLineItem', item: li })}>Edit</button>
                              <button className="danger" onClick={() => removeLineItem.mutate(li.id)}>Delete</button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      {tab === 'expenses' && <ExpenseList projectId={projectId} lineItems={lineItems} />}
    </section>
  )
}
