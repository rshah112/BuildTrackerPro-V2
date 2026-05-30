import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { BudgetLineItem, Expense } from '../../domain/types'
import { balanceDue } from '../../lib/expenseMath'
import { fmt } from '../../lib/money'
import { uploadBlob } from '../../lib/r2'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
import { resolvePaidAmount } from './paidAmount'
import { useCreateExpense, useUpdateExpense } from './useExpenses'

type Draft = Partial<Omit<Expense, 'id' | 'owner'>>

const today = () => new Date().toISOString().slice(0, 10)
const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

function blank(projectId: string): Draft {
  return {
    projectId,
    amount: 0,
    amountPaid: 0,
    vendorName: '',
    invoiceNumber: '',
    date: today(),
    dueDate: null,
    expectedPaymentDate: null,
    paidDate: today(),
    paymentMethod: '',
    paymentReference: '',
    categoryName: '',
    roomTag: '',
    budgetLineItemId: null,
    budgetLineItemTitle: '',
    notes: '',
    isPaid: true,
    receiptObjectKey: null,
  }
}

export function ExpenseForm({
  projectId,
  lineItems,
  initial,
  onSaved,
  onDone,
}: {
  projectId: string
  lineItems: BudgetLineItem[]
  initial?: Expense
  onSaved: (expense: Expense) => Promise<void>
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId))
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const create = useCreateExpense()
  const update = useUpdateExpense()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))
  const date = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value || null }))

  const selectedLineItem = lineItems.find((li) => li.id === d.budgetLineItemId)
  const paidValue = resolvePaidAmount(d.isPaid ?? false, d.amountPaid ?? 0, d.amount ?? 0)
  const balance = balanceDue({ amount: d.amount ?? 0, amountPaid: paidValue, isPaid: d.isPaid ?? false })

  const chooseLineItem = (e: ChangeEvent<HTMLSelectElement>) => {
    const item = lineItems.find((li) => li.id === e.target.value)
    setD((p) => ({
      ...p,
      budgetLineItemId: item?.id ?? null,
      budgetLineItemTitle: item?.title ?? '',
      categoryName: item?.categoryName ?? p.categoryName ?? '',
      roomTag: item?.roomTag ?? p.roomTag ?? '',
    }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const amount = d.amount ?? 0
    const isPaid = d.isPaid ?? false
    const receiptObjectKey = receiptFile ? (await uploadBlob(receiptFile, 'receipt')).key : d.receiptObjectKey ?? null
    const payload: Draft = {
      ...d,
      projectId,
      amount,
      amountPaid: resolvePaidAmount(isPaid, d.amountPaid ?? 0, amount),
      paidDate: isPaid ? d.paidDate || today() : null,
      budgetLineItemId: d.budgetLineItemId || null,
      budgetLineItemTitle: selectedLineItem?.title ?? d.budgetLineItemTitle ?? '',
      categoryName: selectedLineItem?.categoryName ?? d.categoryName ?? '',
      roomTag: selectedLineItem?.roomTag ?? d.roomTag ?? '',
      receiptObjectKey,
    }
    const saved = initial
      ? await update.mutateAsync({ id: initial.id, patch: payload })
      : await create.mutateAsync(payload)
    await onSaved(saved)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
        <Field label="Vendor">
          {(p) => <input {...p} value={d.vendorName ?? ''} onChange={text('vendorName')} required autoFocus />}
        </Field>
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => setD((p) => ({ ...p, amount: v }))} />
        <div className="form-grid">
          <Field label="Invoice #">
            {(p) => <input {...p} value={d.invoiceNumber ?? ''} onChange={text('invoiceNumber')} />}
          </Field>
          <Field label="Date">
            {(p) => <input type="date" {...p} value={dateValue(d.date)} onChange={date('date')} required />}
          </Field>
        </div>
        <Field label="Due date">
          {(p) => <input type="date" {...p} value={dateValue(d.dueDate)} onChange={date('dueDate')} />}
        </Field>
      </div>

      <h3 className="form-section-title">Allocation</h3>
      <div className="form-section">
        <Field label="Budget line">
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
        <div className="form-grid">
          <Field label="Category">
            {(p) => <input {...p} value={d.categoryName ?? ''} onChange={text('categoryName')} />}
          </Field>
          <Field label="Room tag">{(p) => <input {...p} value={d.roomTag ?? ''} onChange={text('roomTag')} />}</Field>
        </div>
      </div>

      <h3 className="form-section-title">Payment</h3>
      <div className="form-section">
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={d.isPaid ?? false}
            onChange={(e) =>
              setD((p) => ({ ...p, isPaid: e.target.checked, paidDate: e.target.checked ? p.paidDate || today() : null }))
            }
          />
          Paid
        </label>
        {d.isPaid && (
          <>
            <CurrencyField
              label="Amount paid"
              value={paidValue}
              onChange={(v) => setD((p) => ({ ...p, amountPaid: v }))}
            />
            <div className="form-grid">
              <Field label="Paid date">
                {(p) => <input type="date" {...p} value={dateValue(d.paidDate)} onChange={date('paidDate')} />}
              </Field>
              <Field label="Payment method">
                {(p) => <input {...p} value={d.paymentMethod ?? ''} onChange={text('paymentMethod')} />}
              </Field>
            </div>
            <Field label="Reference">
              {(p) => <input {...p} value={d.paymentReference ?? ''} onChange={text('paymentReference')} />}
            </Field>
          </>
        )}
        <p className="muted">Balance due: {fmt(balance)}</p>
      </div>

      <h3 className="form-section-title">Receipt &amp; notes</h3>
      <div className="form-section">
        <Field label="Receipt">
          {(p) => (
            <input
              {...p}
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
            />
          )}
        </Field>
        {(receiptFile || d.receiptObjectKey) && (
          <p className="muted">{receiptFile ? receiptFile.name : 'Receipt attached'}</p>
        )}
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </div>

      <div className="form-actions form-actions-sticky">
        <Button type="submit" loading={busy} fullWidth>
          Save expense
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
