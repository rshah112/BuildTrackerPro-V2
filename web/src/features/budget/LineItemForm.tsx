import { useState, type FormEvent, type ChangeEvent } from 'react'
import type { BudgetLineItem } from '../../domain/types'
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
  const num = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value === '' ? 0 : Number(e.target.value) }))
  const check = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.checked }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync(d)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form form-inline">
      <label>Title<input value={d.title ?? ''} onChange={text('title')} required autoFocus /></label>
      <label>Cost code<input value={d.costCode ?? ''} onChange={text('costCode')} /></label>
      <label>Room tag<input value={d.roomTag ?? ''} onChange={text('roomTag')} /></label>
      <label>Budget<input type="number" step="0.01" value={d.budget ?? 0} onChange={num('budget')} /></label>
      <label>Committed<input type="number" step="0.01" value={d.committed ?? 0} onChange={num('committed')} /></label>
      <label>
        <input type="checkbox" checked={d.isAllowance ?? false} onChange={check('isAllowance')} />
        Allowance
      </label>
      {d.isAllowance && (
        <label>Allowance amount<input type="number" step="0.01" value={d.allowanceAmount ?? 0} onChange={num('allowanceAmount')} /></label>
      )}
      <label>Notes<textarea value={d.notes ?? ''} onChange={text('notes')} /></label>
      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
