import { useState, type FormEvent, type ChangeEvent } from 'react'
import type { BudgetCategory, ChangeOrder, Expense } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
import { useCreateCategory, useUpdateCategory, useLineItems, useUpdateLineItem } from './useBudget'
import { useExpenses, useUpdateExpense } from '../expenses/useExpenses'
import { useChangeOrders, useUpdateChangeOrder } from '../changeOrders/useChangeOrders'

type Draft = { name: string; targetBudget: number; sortOrder: number; systemImage: string }

const blank = (projectId: string): Draft & { projectId: string } => ({
  projectId,
  name: '',
  targetBudget: 0,
  sortOrder: 0,
  systemImage: 'folder',
})

export function CategoryForm({
  projectId,
  initial,
  onDone,
}: {
  projectId: string
  initial?: BudgetCategory
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId))
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const { data: lineItems = [] } = useLineItems(projectId)
  const { data: expenses = [] } = useExpenses(projectId)
  const { data: changeOrders = [] } = useChangeOrders(projectId)
  const updateLineItem = useUpdateLineItem()
  const updateExpense = useUpdateExpense()
  const updateChangeOrder = useUpdateChangeOrder()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) {
      const oldName = initial.name
      await update.mutateAsync({ id: initial.id, patch: d })
      // Children reference the category by NAME string — cascade the rename so they
      // don't orphan from the category and its totals.
      if (d.name !== oldName) {
        await Promise.all([
          ...lineItems
            .filter((li) => li.categoryName === oldName)
            .map((li) => updateLineItem.mutateAsync({ id: li.id, patch: { categoryName: d.name } })),
          ...expenses
            .filter((x: Expense) => x.categoryName === oldName)
            .map((x) => updateExpense.mutateAsync({ id: x.id, patch: { categoryName: d.name } })),
          ...changeOrders
            .filter((c: ChangeOrder) => c.categoryName === oldName)
            .map((c) => updateChangeOrder.mutateAsync({ id: c.id, patch: { categoryName: d.name } })),
        ])
      }
    } else {
      await create.mutateAsync({ ...d, projectId })
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
        <Field label="Name">
          {(p) => <input {...p} value={d.name} onChange={text('name')} required autoFocus />}
        </Field>
        <CurrencyField
          label="Target budget"
          value={d.targetBudget}
          onChange={(v) => setD((p) => ({ ...p, targetBudget: v }))}
        />
      </div>
      <div className="form-actions form-actions-sticky">
        <Button type="submit" loading={busy} fullWidth>
          Save
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
