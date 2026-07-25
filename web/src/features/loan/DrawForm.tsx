import type { ChangeEvent } from 'react'
import type { LoanDraw } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { Select } from '../../components/ui/Select'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateDraw, useUpdateDraw } from './useLoan'
import { localDateISO } from '../../lib/date'
import {
  DRAW_INSPECTION_STATUSES,
  DRAW_INSPECTION_STATUS_LABEL,
  DRAW_STATUSES,
  DRAW_STATUS_LABEL,
  type DrawStatus,
} from '../../domain/enums'

type Draft = Partial<Omit<LoanDraw, 'id' | 'owner' | 'createdAt'>>

const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string, loanId: string): Draft => ({
  projectId,
  loanId,
  amount: 0,
  status: 'requested',
  drawDate: localDateISO(),
  requestedDate: localDateISO(),
  approvedDate: null,
  feesAmount: 0,
  inspectionDate: null,
  inspectionStatus: '',
  inspectorName: '',
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
  const { d, setD, set, text, busy, submit, submitError } = useEntityForm<LoanDraw, Draft>({
    initial,
    blank: blank(projectId, loanId),
    create: useCreateDraw(),
    update: useUpdateDraw(),
    onDone,
  })

  const status = (d.status ?? 'funded') as DrawStatus
  const funded = status === 'funded'

  // Advancing the lifecycle stamps the matching date so the timeline fills itself in.
  const setStatus = (next: DrawStatus) =>
    setD((p) => ({
      ...p,
      status: next,
      requestedDate: p.requestedDate ?? localDateISO(),
      approvedDate: next === 'requested' ? p.approvedDate : (p.approvedDate ?? localDateISO()),
      drawDate: next === 'funded' && !p.drawDate ? localDateISO() : p.drawDate,
    }))

  const fees = (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, feesAmount: e.target.value === '' ? 0 : Number(e.target.value) }))

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Status" hint="Only a funded draw counts toward your balance, interest and available cash.">
          {() => (
            <SegmentedControl
              value={status}
              onChange={setStatus}
              ariaLabel="Draw status"
              segments={DRAW_STATUSES.map((value) => ({ value, label: DRAW_STATUS_LABEL[value] }))}
            />
          )}
        </Field>
        <CurrencyField label="Draw amount" value={d.amount ?? 0} onChange={(v) => set('amount', v)} />
        <Field label="Description">
          {(p) => (
            <input {...p} value={d.description ?? ''} onChange={text('description')} placeholder="e.g. Draw 3 — framing" />
          )}
        </Field>
      </Form.Section>

      <Form.Section title="Timeline">
        <div className="form-grid">
          <Field label="Requested">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.requestedDate)}
                onChange={(e) => set('requestedDate', e.target.value || null)}
              />
            )}
          </Field>
          <Field label="Approved">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.approvedDate)}
                onChange={(e) => set('approvedDate', e.target.value || null)}
              />
            )}
          </Field>
        </div>
        {funded && (
          <Field label="Funded" hint="Interest accrues from this date.">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.drawDate)}
                onChange={(e) => set('drawDate', e.target.value || localDateISO())}
              />
            )}
          </Field>
        )}
      </Form.Section>

      <Form.Section title="Inspection">
        <Field label="Inspection status">
          {(p) => (
            <Select {...p} value={d.inspectionStatus ?? ''} onChange={text('inspectionStatus')}>
              {DRAW_INSPECTION_STATUSES.map((value) => (
                <option key={value || 'unset'} value={value}>
                  {DRAW_INSPECTION_STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="form-grid">
          <Field label="Inspection date">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.inspectionDate)}
                onChange={(e) => set('inspectionDate', e.target.value || null)}
              />
            )}
          </Field>
          <Field label="Inspector">
            {(p) => <input {...p} value={d.inspectorName ?? ''} onChange={text('inspectorName')} placeholder="Name" />}
          </Field>
        </div>
      </Form.Section>

      <Form.Section title="Lender fees">
        <Field
          label="Fees netted from this draw"
          hint="Cash that lands in your account is the draw amount less these fees. Principal still accrues interest on the full amount."
        >
          {(p) => (
            <input {...p} type="number" inputMode="decimal" step="0.01" min="0" value={d.feesAmount ?? 0} onChange={fees} />
          )}
        </Field>
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
