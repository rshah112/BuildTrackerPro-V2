import { useQueryClient } from '@tanstack/react-query'
import type { BudgetLineItem } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateLineItem, useUpdateLineItem } from './useBudget'
import { cascadeLineItemTitle } from './cascadeLineItemTitle'

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
  const qc = useQueryClient()
  const { d, setD, text, busy, submit } = useEntityForm<BudgetLineItem, Draft>({
    initial,
    blank: blank(projectId, categoryName),
    create: useCreateLineItem(),
    update: useUpdateLineItem(),
    // A title change must propagate to the denormalized budgetLineItemTitle on expenses/COs/docs
    // (otherwise list rows and the Excel export show the old name). The id link is unaffected, so
    // money is never wrong — this is display consistency.
    onSaved: async (saved) => {
      if (initial && saved.title !== initial.title) {
        await cascadeLineItemTitle(saved.id, saved.title)
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['expenses'] }),
          qc.invalidateQueries({ queryKey: ['change_orders'] }),
          qc.invalidateQueries({ queryKey: ['project_documents'] }),
        ])
      }
    },
    onDone,
  })
  const money = (k: keyof Draft) => (v: number) => setD((p) => ({ ...p, [k]: v }))

  return (
    <Form onSubmit={submit}>
      <Form.Section>
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
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
