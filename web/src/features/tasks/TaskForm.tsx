import type { BudgetLineItem, ProjectTask, Vendor } from '../../domain/types'
import { PROJECT_TASK_STATUSES } from '../../domain/enums'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
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
  const { d, text, date, busy, submit } = useEntityForm<ProjectTask, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateTask(),
    update: useUpdateTask(),
    onDone,
    transform: (draft) => {
      const status = draft.status ?? 'todo'
      return {
        ...draft,
        projectId,
        vendorId: draft.vendorId || null,
        budgetLineItemId: draft.budgetLineItemId || null,
        completedAt: status === 'done' ? draft.completedAt || now() : null,
      }
    },
  })

  return (
    <Form onSubmit={submit}>
      <Form.Section>
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
        <Field
          label="Vendor"
          hint={vendors.length === 0 ? 'No vendors yet — add them in Vendors first.' : undefined}
        >
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
        <Field
          label="Budget line"
          hint={lineItems.length === 0 ? 'No budget line items yet — add them in Budget first.' : undefined}
        >
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
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
