import type { LoanDraw } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateDraw, useUpdateDraw } from './useLoan'

type Draft = Partial<Omit<LoanDraw, 'id' | 'owner' | 'createdAt'>>

const today = () => new Date().toISOString().slice(0, 10)
const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string, loanId: string): Draft => ({
  projectId,
  loanId,
  amount: 0,
  drawDate: today(),
  description: '',
  notes: '',
})

export function DrawForm({
  projectId,
  loanId,
  initial,
  onDone,
}: {
  projectId: string
  loanId: string
  initial?: LoanDraw
  onDone: () => void
}) {
  const { d, set, text, busy, submit, submitError } = useEntityForm<LoanDraw, Draft>({
    initial,
    blank: blank(projectId, loanId),
    create: useCreateDraw(),
    update: useUpdateDraw(),
    onDone,
  })

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <CurrencyField label="Draw amount" value={d.amount ?? 0} onChange={(v) => set('amount', v)} />
        <div className="form-grid">
          <Field label="Draw date">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.drawDate)}
                onChange={(e) => set('drawDate', e.target.value || today())}
              />
            )}
          </Field>
          <Field label="Description">
            {(p) => <input {...p} value={d.description ?? ''} onChange={text('description')} placeholder="e.g. Draw 3 — framing" />}
          </Field>
        </div>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save draw" />
    </Form>
  )
}
