import type { ChangeEvent } from 'react'
import type { ConstructionLoan } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { Select } from '../../components/ui/Select'
import { useEntityForm } from '../../lib/useEntityForm'
import { fmtDate } from '../../lib/date'
import { INTEREST_BASES, INTEREST_BASIS_LABEL } from '../../domain/enums'
import { useCreateLoan, useUpdateLoan } from './useLoan'
import { resolvedMaturity } from './loanMath'

type Draft = Partial<Omit<ConstructionLoan, 'id' | 'owner' | 'createdAt'>>

const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

// Amounts and rate start empty — they're deal-specific and must be entered, not guessed at.
// Only the structural defaults are pre-set: a 15-month interest-only term is the common
// shape for a construction loan, and actual/365 is the usual day-count convention. With no
// start date there's no maturity, so an unclosed loan simply shows no countdown.
const blank = (projectId: string): Draft => ({
  projectId,
  lender: '',
  totalAmount: 0,
  interestRate: 0,
  startDate: null,
  termMonths: 15,
  maturityDate: null,
  originationFee: 0,
  interestReserveAmount: 0,
  interestBasis: 'actual/365',
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
  const term = (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, termMonths: e.target.value === '' ? 0 : Math.max(0, Math.round(Number(e.target.value))) }))

  // Shown live so the 15-month clock is concrete the moment a closing date is entered.
  const maturity = resolvedMaturity({
    totalAmount: d.totalAmount ?? 0,
    interestRate: d.interestRate ?? 0,
    startDate: d.startDate,
    termMonths: d.termMonths,
    maturityDate: d.maturityDate,
  })

  return (
    <Form onSubmit={submit}>
      <Form.Section title="Facility">
        <Field label="Lender">
          {(p) => <input {...p} value={d.lender ?? ''} onChange={text('lender')} placeholder="e.g. First National" autoFocus />}
        </Field>
        <CurrencyField label="Total loan amount" value={d.totalAmount ?? 0} onChange={(v) => set('totalAmount', v)} />
        <div className="form-grid">
          <Field label="Interest rate" hint="Annual %, interest-only.">
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
          <Field label="Term (months)" hint="Interest-only period.">
            {(p) => (
              <input {...p} type="number" inputMode="numeric" step="1" min="0" value={d.termMonths ?? 0} onChange={term} />
            )}
          </Field>
        </div>
      </Form.Section>

      <Form.Section title="Dates">
        <div className="form-grid">
          <Field label="Closing / start date" hint="Leave blank until the loan closes.">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.startDate)}
                onChange={(e) => set('startDate', e.target.value || null)}
              />
            )}
          </Field>
          <Field
            label="Maturity date"
            hint={maturity && !d.maturityDate ? `Defaults to ${fmtDate(maturity)}` : 'Only if the lender set a different date.'}
          >
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.maturityDate)}
                onChange={(e) => set('maturityDate', e.target.value || null)}
              />
            )}
          </Field>
        </div>
      </Form.Section>

      <Form.Section title="Costs">
        <CurrencyField
          label="Origination / closing fee"
          value={d.originationFee ?? 0}
          onChange={(v) => set('originationFee', v)}
        />
        <CurrencyField
          label="Interest reserve held by lender"
          value={d.interestReserveAmount ?? 0}
          onChange={(v) => set('interestReserveAmount', v)}
        />
        <Field
          label="Interest basis"
          hint="Day-count convention the lender bills on. Worth about 1.4% on the interest figure."
        >
          {(p) => (
            <Select {...p} value={d.interestBasis ?? 'actual/365'} onChange={text('interestBasis')}>
              {INTEREST_BASES.map((basis) => (
                <option key={basis} value={basis}>
                  {INTEREST_BASIS_LABEL[basis]}
                </option>
              ))}
            </Select>
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
