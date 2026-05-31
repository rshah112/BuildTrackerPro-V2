import type { ChangeEvent } from 'react'
import type { ConstructionLoan } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateLoan, useUpdateLoan } from './useLoan'

type Draft = Partial<Omit<ConstructionLoan, 'id' | 'owner' | 'createdAt'>>

const blank = (projectId: string): Draft => ({
  projectId,
  lender: '',
  totalAmount: 0,
  interestRate: 0,
  notes: '',
})

export function LoanForm({
  projectId,
  initial,
  onDone,
}: {
  projectId: string
  initial?: ConstructionLoan
  onDone: () => void
}) {
  const { d, setD, set, text, busy, submit, submitError } = useEntityForm<ConstructionLoan, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateLoan(),
    update: useUpdateLoan(),
    onDone,
  })

  const rate = (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, interestRate: e.target.value === '' ? 0 : Number(e.target.value) }))

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Lender">
          {(p) => <input {...p} value={d.lender ?? ''} onChange={text('lender')} placeholder="e.g. First National" autoFocus />}
        </Field>
        <CurrencyField label="Total loan amount" value={d.totalAmount ?? 0} onChange={(v) => set('totalAmount', v)} />
        <Field label="Interest rate" hint="Annual %, interest-only. Monthly interest is charged on the amount drawn.">
          {(p) => (
            <input
              {...p}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={d.interestRate ?? 0}
              onChange={rate}
            />
          )}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save loan" />
    </Form>
  )
}
