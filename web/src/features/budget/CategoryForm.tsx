import { useState, type FormEvent, type ChangeEvent } from 'react'
import type { BudgetCategory } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
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

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync({ ...d, projectId })
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
