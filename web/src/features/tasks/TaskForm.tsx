import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { BudgetLineItem, ProjectTask, Vendor } from '../../domain/types'
import { PROJECT_TASK_STATUSES } from '../../domain/enums'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { useCreateTask, useUpdateTask } from './useTasks'

type Draft = Partial<Omit<ProjectTask, 'id' | 'owner' | 'createdAt'>>

const now = () => new Date().toISOString()
const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string): Draft => ({
  projectId,
  title: '',
  status: 'todo',
  dueDate: null,
  vendorId: null,
  budgetLineItemId: null,
  photoIds: [],
  notes: '',
  completedAt: null,
})

export function TaskForm({
  projectId,
  vendors,
  lineItems,
  initial,
  onDone,
}: {
  projectId: string
  vendors: Vendor[]
  lineItems: BudgetLineItem[]
  initial?: ProjectTask
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId))
  const create = useCreateTask()
  const update = useUpdateTask()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))
  const date = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value || null }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    const status = d.status ?? 'todo'
    const payload: Draft = {
      ...d,
      projectId,
      vendorId: d.vendorId || null,
      budgetLineItemId: d.budgetLineItemId || null,
      completedAt: status === 'done' ? d.completedAt || now() : null,
    }
    if (initial) await update.mutateAsync({ id: initial.id, patch: payload })
    else await create.mutateAsync(payload)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
        <Field label="Title">
          {(p) => <input {...p} value={d.title ?? ''} onChange={text('title')} required autoFocus />}
        </Field>
        <div className="form-grid">
          <Field label="Status">
            {(p) => (
              <Select {...p} value={d.status} onChange={text('status')}>
                {PROJECT_TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due date">
            {(p) => <input type="date" {...p} value={dateValue(d.dueDate)} onChange={date('dueDate')} />}
          </Field>
        </div>
        <Field label="Vendor">
          {(p) => (
            <Select {...p} value={d.vendorId ?? ''} onChange={text('vendorId')}>
              <option value="">Unassigned</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Budget line">
          {(p) => (
            <Select {...p} value={d.budgetLineItemId ?? ''} onChange={text('budgetLineItemId')}>
              <option value="">Unassigned</option>
              {lineItems.map((li) => (
                <option key={li.id} value={li.id}>
                  {li.categoryName} / {li.title}
                </option>
              ))}
            </Select>
          )}
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
