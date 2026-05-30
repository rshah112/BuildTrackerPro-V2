import type { ChangeEvent } from 'react'
import type { BudgetLineItem, ChangeOrder } from '../../domain/types'
import { CHANGE_ORDER_STATUSES } from '../../domain/enums'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateChangeOrder, useUpdateChangeOrder } from './useChangeOrders'

type Draft = Partial<Omit<ChangeOrder, 'id' | 'owner' | 'createdAt'>>

const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string): Draft => ({
  projectId,
  title: '',
  amount: 0,
  status: 'pending',
  notes: '',
  categoryName: '',
  budgetLineItemId: null,
  budgetLineItemTitle: '',
  expectedPaymentDate: null,
})

export function ChangeOrderForm({
  projectId,
  lineItems,
  initial,
  onSaved,
  onDone,
}: {
  projectId: string
  lineItems: BudgetLineItem[]
  initial?: ChangeOrder
  onSaved: (saved: ChangeOrder) => Promise<void>
  onDone: () => void
}) {
  const { d, setD, set, text, date, busy, submit } = useEntityForm<ChangeOrder, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateChangeOrder(),
    update: useUpdateChangeOrder(),
    onSaved,
    onDone,
  })

  const chooseLineItem = (e: ChangeEvent<HTMLSelectElement>) => {
    const item = lineItems.find((li) => li.id === e.target.value)
    setD((p) => ({
      ...p,
      budgetLineItemId: item?.id ?? null,
      budgetLineItemTitle: item?.title ?? '',
      categoryName: item?.categoryName ?? p.categoryName ?? '',
    }))
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Title">
          {(p) => <input {...p} value={d.title ?? ''} onChange={text('title')} required autoFocus />}
        </Field>
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => set('amount', v)} />
        <Field label="Status">
          {(p) => (
            <Select {...p} value={d.status} onChange={text('status')}>
              {CHANGE_ORDER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
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
            <Select {...p} value={d.budgetLineItemId ?? ''} onChange={chooseLineItem}>
              <option value="">Unassigned</option>
              {lineItems.map((li) => (
                <option key={li.id} value={li.id}>
                  {li.categoryName} / {li.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Expected payment date">
          {(p) => (
            <input
              type="date"
              {...p}
              value={dateValue(d.expectedPaymentDate)}
              onChange={date('expectedPaymentDate')}
            />
          )}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
