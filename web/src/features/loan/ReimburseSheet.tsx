import { useMemo, useState } from 'react'
import type { Expense, LoanDraw } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import { localDateISO, fmtDate } from '../../lib/date'
import { cents, fmt } from '../../lib/money'
import { PAYMENT_METHODS, normalizeFundingSource } from '../../domain/enums'
import { useCreateAllocation, useCreateDisbursement } from './useTreasury'
import {
  drawNetFunded,
  expenseSettlement,
  undisbursedFromDraw,
  type TreasuryAllocation,
  type TreasuryDisbursement,
} from './treasury'

/**
 * Mark ONE expense reimbursed, from the expense side, tied to the draw that funded it.
 *
 * Same records as the loan-screen flow — a disbursement plus one allocation — just entered
 * from the other end. Nothing here writes to the expense, so the project's cost is unchanged:
 * repaying yourself $5,000 for the architect leaves the budget at $5,000, not $10,000.
 */
export function ReimburseSheet({
  projectId,
  expense,
  draws,
  disbursements,
  allocations,
  onDone,
}: {
  projectId: string
  expense: Expense
  draws: LoanDraw[]
  disbursements: TreasuryDisbursement[]
  allocations: TreasuryAllocation[]
  onDone: () => void
}) {
  const createDisbursement = useCreateDisbursement()
  const createAllocation = useCreateAllocation()
  const toast = useToast()

  const settlement = useMemo(() => expenseSettlement(expense, allocations), [expense, allocations])
  const funded = useMemo(
    () => draws.filter((d) => (d.status ?? 'funded') === 'funded' && undisbursedFromDraw(d, disbursements) > 0),
    [draws, disbursements],
  )

  const [drawId, setDrawId] = useState(funded[0]?.id ?? '')
  const [amount, setAmount] = useState(settlement.outstanding)
  const [date, setDate] = useState(localDateISO())
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const origin = normalizeFundingSource(expense.fundingSource)
  const partyType = origin === 'builder' ? 'builder' : 'self'
  const partyName = origin === 'builder' ? 'Builder' : 'You'
  const selectedDraw = funded.find((d) => d.id === drawId)
  const cashAvailable = selectedDraw ? undisbursedFromDraw(selectedDraw, disbursements) : 0
  const overCash = cents(amount) > cents(cashAvailable)
  const overOutstanding = cents(amount) > cents(settlement.outstanding)

  // Draw-funded and lender-paid costs were never fronted by anyone, so there is nothing owed.
  if (settlement.state === 'not_applicable') {
    return (
      <div className="form">
        <p className="panel-lead">
          {origin === 'owner_draw' || origin === 'loan_direct'
            ? 'This cost was already paid with loan money, so nobody fronted it and there is nothing to reimburse.'
            : 'Nothing has been paid out on this bill yet, so there is nothing to reimburse.'}
        </p>
        <Form.Actions busy={false} onCancel={onDone} saveLabel="Close" cancelLabel="Close" />
      </div>
    )
  }

  if (settlement.state === 'reimbursed') {
    return (
      <div className="form">
        <p className="panel-lead">
          Fully reimbursed — {fmt(settlement.reimbursed)} has been repaid to {partyName.toLowerCase()} out of draw cash.
        </p>
        <Form.Actions busy={false} onCancel={onDone} saveLabel="Close" cancelLabel="Close" />
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!drawId) return setError('Choose the draw this reimbursement came out of.')
    if (!(amount > 0)) return setError('Enter an amount greater than $0.')
    setBusy(true)
    try {
      const disbursement = await createDisbursement.mutateAsync({
        projectId,
        drawId,
        partyType,
        partyName,
        amount,
        disbursedDate: date,
        paymentMethod: method,
        paymentReference: reference,
        notes: `Reimbursement for ${expense.vendorName || 'expense'}`,
      })
      await createAllocation.mutateAsync({
        projectId,
        disbursementId: disbursement.id,
        expenseId: expense.id,
        amount,
      })
      toast.success(`${fmt(amount)} reimbursed — your budget is unchanged`)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t record this reimbursement.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <div className="kv-row">
          <span className="muted">{origin === 'builder' ? 'Builder fronted' : 'You fronted'}</span>
          <strong className="tnum">{fmt(settlement.reimbursable)}</strong>
        </div>
        {settlement.reimbursed > 0 && (
          <div className="kv-row">
            <span className="muted">Already repaid</span>
            <span className="tnum">{fmt(settlement.reimbursed)}</span>
          </div>
        )}
        <div className="kv-row">
          <span className="muted">Still owed</span>
          <strong className="tnum">{fmt(settlement.outstanding)}</strong>
        </div>
      </Form.Section>

      <Form.Section title="Reimburse from">
        {funded.length === 0 ? (
          <p className="panel-lead">
            No funded draw has cash left to pay this from. Record a draw as <strong>Funded</strong> on the
            Construction loan screen first.
          </p>
        ) : (
          <Field label="Draw" hint={selectedDraw ? `${fmt(cashAvailable)} of this draw is still undisbursed.` : undefined}>
            {(p) => (
              <Select {...p} value={drawId} onChange={(e) => setDrawId(e.target.value)}>
                {funded.map((dr) => (
                  <option key={dr.id} value={dr.id}>
                    {dr.description || `Draw ${fmtDate(dr.drawDate)}`} — {fmt(drawNetFunded(dr))} funded
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <CurrencyField
          label="Amount"
          value={amount}
          onChange={setAmount}
          hint="Repay it all now, or part of it and the rest out of a later draw."
          error={
            overOutstanding
              ? `Only ${fmt(settlement.outstanding)} is still owed on this expense.`
              : overCash
                ? `Only ${fmt(cashAvailable)} of this draw is still undisbursed.`
                : undefined
          }
        />
        <div className="form-grid">
          <Field label="Date">
            {(p) => <input type="date" {...p} value={date} onChange={(e) => setDate(e.target.value || localDateISO())} />}
          </Field>
          <Field label="Method">
            {(p) => (
              <Select {...p} value={method} onChange={(e) => setMethod(e.target.value)}>
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
            <input {...p} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Check #, confirmation…" />
          )}
        </Field>
      </Form.Section>

      <p className="panel-foot">
        This records a cash transfer only. The {fmt(expense.amount)} cost stays exactly where it is in your
        budget — reimbursing yourself does not spend the money twice.
      </p>

      {error && (
        <p role="alert" className="error-banner">
          {error}
        </p>
      )}
      <div className="form-actions form-actions-sticky">
        <Button type="submit" loading={busy} fullWidth disabled={funded.length === 0 || overCash || overOutstanding}>
          Record reimbursement
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Form>
  )
}
