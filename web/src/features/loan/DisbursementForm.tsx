import { useMemo, useState } from 'react'
import type { DrawDisbursement, Expense, LoanDraw, Vendor } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { Select } from '../../components/ui/Select'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { useEntityForm } from '../../lib/useEntityForm'
import { localDateISO, fmtDate } from '../../lib/date'
import { cents, dollars, fmt, sumBy } from '../../lib/money'
import { PAYMENT_METHODS, DISBURSEMENT_PARTY_LABEL, DISBURSEMENT_PARTY_TYPES, type DisbursementPartyType } from '../../domain/enums'
import { useCreateDisbursement, useCreateAllocation, useUpdateDisbursement } from './useTreasury'
import { drawNetFunded, expenseSettlements, undisbursedFromDraw, type TreasuryAllocation, type TreasuryDisbursement } from './treasury'

type Draft = Partial<Omit<DrawDisbursement, 'id' | 'owner' | 'createdAt'>>

const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string, drawId: string): Draft => ({
  projectId,
  drawId,
  partyType: 'self',
  vendorId: null,
  partyName: '',
  amount: 0,
  disbursedDate: localDateISO(),
  paymentMethod: '',
  paymentReference: '',
  notes: '',
})

/**
 * Record cash leaving a draw, and (optionally) which expenses it settled.
 *
 * This is a TREASURY record: it moves money between the loan, you, the builder, and subs.
 * It never creates or edits an expense, so budget actuals, category spend, EAC and cash flow
 * are untouched — repaying yourself for the architect does not spend the money twice.
 */
export function DisbursementForm({
  projectId,
  draws,
  disbursements,
  expenses,
  vendors,
  allocations,
  initial,
  defaultDrawId,
  onDone,
}: {
  projectId: string
  draws: LoanDraw[]
  disbursements: TreasuryDisbursement[]
  expenses: Expense[]
  vendors: Vendor[]
  allocations: TreasuryAllocation[]
  initial?: DrawDisbursement
  defaultDrawId?: string
  onDone: () => void
}) {
  const fundedDrawList = useMemo(() => draws.filter((d) => (d.status ?? 'funded') === 'funded'), [draws])
  const firstDrawId = defaultDrawId ?? fundedDrawList[0]?.id ?? ''
  const createAllocation = useCreateAllocation()

  // expenseId -> dollars applied. Only used when creating; editing a disbursement edits the
  // cash record itself, and allocations are managed from the draw detail list.
  const [applied, setApplied] = useState<Record<string, number>>({})

  const { d, setD, set, text, busy, submit, submitError } = useEntityForm<DrawDisbursement, Draft>({
    initial,
    blank: blank(projectId, firstDrawId),
    create: useCreateDisbursement(),
    update: useUpdateDisbursement(),
    onSaved: async (saved) => {
      // The disbursement row has committed (or been queued offline with a stable id), so the
      // allocations can safely reference it.
      if (initial) return
      for (const [expenseId, amount] of Object.entries(applied)) {
        if (amount <= 0) continue
        await createAllocation.mutateAsync({ projectId, disbursementId: saved.id, expenseId, amount })
      }
    },
    onDone,
  })

  const partyType = (d.partyType ?? 'self') as DisbursementPartyType
  const settlements = useMemo(() => expenseSettlements(expenses, allocations), [expenses, allocations])

  // Expenses this party actually fronted and is still owed for. Paying a sub directly isn't a
  // reimbursement, so that party type gets no outstanding list.
  const owedExpenses = useMemo(() => {
    if (partyType === 'vendor') return []
    const origin = partyType === 'self' ? 'owner_personal' : 'builder'
    return expenses
      .filter((e) => {
        const s = settlements.get(e.id)
        return s && s.origin === origin && s.outstanding > 0
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [expenses, settlements, partyType])

  const selectedDraw = fundedDrawList.find((dr) => dr.id === d.drawId)
  const cashAvailable = selectedDraw
    ? dollars(
        cents(undisbursedFromDraw(selectedDraw, disbursements)) + cents(initial && initial.drawId === selectedDraw.id ? initial.amount : 0),
      )
    : 0
  const appliedTotal = sumBy(Object.values(applied), (v) => v)
  const amount = d.amount ?? 0
  const overCash = cents(amount) > cents(cashAvailable)
  const overApplied = cents(appliedTotal) > cents(amount)

  const setParty = (next: DisbursementPartyType) =>
    setD((p) => ({
      ...p,
      partyType: next,
      vendorId: next === 'vendor' ? p.vendorId : null,
      partyName: next === 'self' ? 'You' : next === 'builder' ? p.partyName || 'Builder' : '',
    }))

  const toggleExpense = (expense: Expense, on: boolean) => {
    setApplied((prev) => {
      const next = { ...prev }
      if (!on) delete next[expense.id]
      else next[expense.id] = settlements.get(expense.id)?.outstanding ?? 0
      return next
    })
  }

  /** Applying receipts is the normal way to arrive at the cheque amount, so keep them in sync. */
  const applyAllOutstanding = () => {
    const next: Record<string, number> = {}
    for (const e of owedExpenses) next[e.id] = settlements.get(e.id)?.outstanding ?? 0
    setApplied(next)
    setD((p) => ({ ...p, amount: sumBy(Object.values(next), (v) => v) }))
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Paid from draw">
          {(p) => (
            <Select {...p} value={d.drawId ?? ''} onChange={text('drawId')}>
              {fundedDrawList.length === 0 && <option value="">No funded draws yet</option>}
              {fundedDrawList.map((dr) => (
                <option key={dr.id} value={dr.id}>
                  {dr.description || `Draw ${fmtDate(dr.drawDate)}`} — {fmt(drawNetFunded(dr))} funded
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Who received it">
          {(p) => (
            <Select {...p} value={partyType} onChange={(e) => setParty(e.target.value as DisbursementPartyType)}>
              {DISBURSEMENT_PARTY_TYPES.map((value) => (
                <option key={value} value={value}>
                  {DISBURSEMENT_PARTY_LABEL[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {partyType === 'vendor' ? (
          <Field label="Sub / vendor">
            {(p) => (
              <Select
                {...p}
                value={d.vendorId ?? ''}
                onChange={(e) => {
                  const vendor = vendors.find((v) => v.id === e.target.value)
                  setD((prev) => ({ ...prev, vendorId: e.target.value || null, partyName: vendor?.name ?? '' }))
                }}
              >
                <option value="">Select a vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : (
          partyType === 'builder' && (
            <Field label="Builder name">
              {(p) => <input {...p} value={d.partyName ?? ''} onChange={text('partyName')} placeholder="Builder" />}
            </Field>
          )
        )}
        <CurrencyField label="Amount" value={amount} onChange={(v) => set('amount', v)} />
        {selectedDraw && (
          <p className={overCash ? 'field-error' : 'field-hint'}>
            {overCash
              ? `Only ${fmt(cashAvailable)} of this draw is still undisbursed.`
              : `${fmt(cashAvailable)} of this draw is still undisbursed.`}
          </p>
        )}
      </Form.Section>

      {!initial && owedExpenses.length > 0 && (
        <Form.Section title={partyType === 'self' ? 'What this repays you for' : 'What this repays the builder for'}>
          <p className="field-hint">
            Tagging receipts records which costs this cash settled. It does not change the budget — the
            cost was already counted when the expense was logged.
          </p>
          <ul className="card-list">
            {owedExpenses.map((e) => {
              const outstanding = settlements.get(e.id)?.outstanding ?? 0
              const on = applied[e.id] != null
              return (
                <li key={e.id} className="kv-row">
                  <label className="checkbox-row">
                    <input type="checkbox" checked={on} onChange={(ev) => toggleExpense(e, ev.target.checked)} />
                    <span>
                      <strong>{e.vendorName || 'Expense'}</strong>
                      <span className="muted"> · {fmtDate(e.date)} · {e.categoryName || 'Uncategorized'}</span>
                    </span>
                  </label>
                  <span className="tnum">{fmt(outstanding)}</span>
                </li>
              )
            })}
          </ul>
          <div className="kv-row">
            <Button type="button" size="sm" variant="ghost" onClick={applyAllOutstanding}>
              Apply all outstanding ({fmt(sumBy(owedExpenses, (e) => settlements.get(e.id)?.outstanding ?? 0))})
            </Button>
            <span className="tnum">
              {fmt(appliedTotal)} tagged
              {appliedTotal > 0 && cents(appliedTotal) < cents(amount) && (
                <Badge tone="info"> {fmt(dollars(cents(amount) - cents(appliedTotal)))} advance</Badge>
              )}
            </span>
          </div>
          {overApplied && <p className="field-error">Tagged receipts exceed the amount being paid.</p>}
        </Form.Section>
      )}

      <Form.Section title="Payment">
        <div className="form-grid">
          <Field label="Date">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.disbursedDate)}
                onChange={(e) => set('disbursedDate', e.target.value || localDateISO())}
              />
            )}
          </Field>
          <Field label="Method">
            {(p) => (
              <Select {...p} value={d.paymentMethod ?? ''} onChange={text('paymentMethod')}>
                <option value="">—</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Reference">
          {(p) => (
            <input {...p} value={d.paymentReference ?? ''} onChange={text('paymentReference')} placeholder="Check #, confirmation…" />
          )}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>

      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Record payment" />
    </Form>
  )
}
