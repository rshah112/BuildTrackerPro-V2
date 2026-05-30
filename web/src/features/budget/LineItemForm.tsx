import { useState, type FormEvent, type ChangeEvent } from 'react'
import type { BudgetLineItem } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
import { useCreateLineItem, useUpdateLineItem } from './useBudget'

type Draft = Partial<Omit<BudgetLineItem, 'id' | 'owner' | 'createdAt'>>

const blank = (projectId: string, categoryName: string): Draft => ({
  projectId,
  categoryName,
  costCode: '',
  title: '',
  roomTag: '',
  budget: 0,
  actual: 0,
  committed: 0,
  notes: '',
  isPinned: false,
  isAllowance: false,
  allowanceAmount: 0,
})

export function LineItemForm({
  projectId,
  categoryName,
  initial,
  onDone,
}: {
  projectId: string
  categoryName: string
  initial?: BudgetLineItem
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId, categoryName))
  const create = useCreateLineItem()
  const update = useUpdateLineItem()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))
  const money = (k: keyof Draft) => (v: number) => setD((p) => ({ ...p, [k]: v }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync(d)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
        <Field label="Title">
          {(p) => <input {...p} value={d.title ?? ''} onChange={text('title')} required autoFocus />}
        </Field>
        <div className="form-grid">
          <Field label="Cost code">{(p) => <input {...p} value={d.costCode ?? ''} onChange={text('costCode')} />}</Field>
          <Field label="Room tag">{(p) => <input {...p} value={d.roomTag ?? ''} onChange={text('roomTag')} />}</Field>
        </div>
        <div className="form-grid">
          <CurrencyField label="Budget" value={d.budget ?? 0} onChange={money('budget')} />
          <CurrencyField label="Committed" value={d.committed ?? 0} onChange={money('committed')} />
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={d.isAllowance ?? false}
            onChange={(e) => setD((p) => ({ ...p, isAllowance: e.target.checked }))}
          />
          Allowance line item
        </label>
        {d.isAllowance && (
          <CurrencyField
            label="Allowance amount"
            value={d.allowanceAmount ?? 0}
            onChange={money('allowanceAmount')}
          />
        )}
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
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
