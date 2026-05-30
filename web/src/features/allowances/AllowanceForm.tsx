import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { AllowanceSelection, BudgetLineItem } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
import { useCreateAllowance, useUpdateAllowance } from './useAllowances'

type Draft = Partial<Omit<AllowanceSelection, 'id' | 'owner'>>

const today = () => new Date().toISOString().slice(0, 10)
const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string, lineItemId: string): Draft => ({
  projectId,
  lineItemId,
  selectionDate: today(),
  vendor: '',
  amount: 0,
  notes: '',
  photoObjectKey: null,
})

export function AllowanceForm({
  projectId,
  lineItems,
  initial,
  onSaved,
  onDone,
}: {
  projectId: string
  lineItems: BudgetLineItem[]
  initial?: AllowanceSelection
  onSaved: (saved: AllowanceSelection) => Promise<void>
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId, lineItems[0]?.id ?? ''))
  const create = useCreateAllowance()
  const update = useUpdateAllowance()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))
  const date = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value || today() }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const saved = initial
      ? await update.mutateAsync({ id: initial.id, patch: d })
      : await create.mutateAsync(d)
    await onSaved(saved)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
        <Field label="Line item">
          {(p) => (
            <Select {...p} value={d.lineItemId ?? ''} onChange={text('lineItemId')} required>
              <option value="" disabled>
                Select a line item
              </option>
              {lineItems.map((li) => (
                <option key={li.id} value={li.id}>
                  {li.categoryName} / {li.title}
                  {li.isAllowance ? ' (allowance)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => setD((p) => ({ ...p, amount: v }))} />
        <Field label="Vendor">{(p) => <input {...p} value={d.vendor ?? ''} onChange={text('vendor')} />}</Field>
        <Field label="Selection date">
          {(p) => <input type="date" {...p} value={dateValue(d.selectionDate)} onChange={date('selectionDate')} />}
        </Field>
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
