import { useState, type FormEvent } from 'react'
import type { BudgetCategory } from '../../domain/types'
import { useCreateCategory, useUpdateCategory } from './useBudget'

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
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))
  const num = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value === '' ? 0 : Number(e.target.value) }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync({ ...d, projectId })
    onDone()
  }

  return (
    <form onSubmit={submit} className="form form-inline">
      <label>
        Name
        <input value={d.name} onChange={text('name')} required autoFocus />
      </label>
      <label>
        Target budget
        <input type="number" step="0.01" value={d.targetBudget} onChange={num('targetBudget')} />
      </label>
      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
