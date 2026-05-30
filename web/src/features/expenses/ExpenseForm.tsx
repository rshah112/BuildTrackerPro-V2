import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { BudgetLineItem, Expense } from '../../domain/types'
import { balanceDue } from '../../lib/expenseMath'
import { fmt } from '../../lib/money'
import { uploadBlob } from '../../lib/r2'
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
  const num = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value === '' ? 0 : Number(e.target.value) }))
  const date = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value || null }))

  const selectedLineItem = lineItems.find((li) => li.id === d.budgetLineItemId)
  const paidValue = resolvePaidAmount(d.isPaid ?? false, d.amountPaid ?? 0, d.amount ?? 0)
  const balance = balanceDue({
    amount: d.amount ?? 0,
    amountPaid: paidValue,
    isPaid: d.isPaid ?? false,
  })

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

  const togglePaid = (e: ChangeEvent<HTMLInputElement>) => {
    const isPaid = e.target.checked
    setD((p) => ({
      ...p,
      isPaid,
      amountPaid: isPaid && (p.amountPaid ?? 0) === 0 ? p.amount ?? 0 : p.amountPaid ?? 0,
      paidDate: isPaid ? p.paidDate || today() : null,
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
    <form onSubmit={submit} className="form form-inline">
      <label>Vendor<input value={d.vendorName ?? ''} onChange={text('vendorName')} required autoFocus /></label>
      <label>Amount<input type="number" step="0.01" min="0" value={d.amount ?? 0} onChange={num('amount')} /></label>
      <label>Invoice #<input value={d.invoiceNumber ?? ''} onChange={text('invoiceNumber')} /></label>
      <label>Date<input type="date" value={dateValue(d.date)} onChange={date('date')} required /></label>
      <label>Due date<input type="date" value={dateValue(d.dueDate)} onChange={date('dueDate')} /></label>
      <label>
        Budget line
        <select value={d.budgetLineItemId ?? ''} onChange={chooseLineItem}>
          <option value="">Unassigned</option>
          {lineItems.map((li) => (
            <option key={li.id} value={li.id}>{li.categoryName} / {li.title}</option>
          ))}
        </select>
      </label>
      <label>Category<input value={d.categoryName ?? ''} onChange={text('categoryName')} /></label>
      <label>Room tag<input value={d.roomTag ?? ''} onChange={text('roomTag')} /></label>
      <label>
        <input type="checkbox" checked={d.isPaid ?? false} onChange={togglePaid} />
        Paid
      </label>
      {d.isPaid && (
        <>
          <label>Amount paid<input type="number" step="0.01" min="0" value={paidValue} onChange={num('amountPaid')} /></label>
          <label>Paid date<input type="date" value={dateValue(d.paidDate)} onChange={date('paidDate')} /></label>
          <label>Payment method<input value={d.paymentMethod ?? ''} onChange={text('paymentMethod')} /></label>
          <label>Reference<input value={d.paymentReference ?? ''} onChange={text('paymentReference')} /></label>
        </>
      )}
      <label>
        Receipt
        <input
          type="file"
          accept="image/*,application/pdf"
          onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {(receiptFile || d.receiptObjectKey) && (
        <p className="muted">{receiptFile ? receiptFile.name : 'Receipt attached'}</p>
      )}
      <label>Notes<textarea value={d.notes ?? ''} onChange={text('notes')} /></label>
      <p className="muted">Balance due: {fmt(balance)}</p>
      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save expense'}</button>
        <button type="button" className="secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
