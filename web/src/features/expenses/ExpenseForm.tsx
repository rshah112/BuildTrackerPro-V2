import { useRef, useState, type ChangeEvent } from 'react'
import { ScanLine } from 'lucide-react'
import type { BudgetLineItem, Expense } from '../../domain/types'
import { balanceDue } from '../../lib/expenseMath'
import { fmt } from '../../lib/money'
import { uploadBlob, signedDownloadUrl } from '../../lib/r2'
import { scanReceipt } from '../../lib/receiptOcr'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
import { FileUploadField } from '../../components/ui/FileUploadField'
import { Form } from '../../components/ui/Form'
import { useToast } from '../../components/ui/Toast'
import { useEntityForm } from '../../lib/useEntityForm'
import { resolvePaidAmount } from './paidAmount'
import { useCreateExpense, useUpdateExpense } from './useExpenses'
import { useLoan } from '../loan/useLoan'

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
    fundingSource: '',
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  // Once the user edits "Amount paid", honor their literal value (incl. $0) instead of
  // re-deriving the full-amount default on every render.
  const [paidTouched, setPaidTouched] = useState(false)
  // Funding source (personal vs loan) only matters once the project is financed.
  const hasLoan = (useLoan(projectId).data ?? []).length > 0
  const scanRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const toast = useToast()

  const { d, setD, text, date, busy, submit, submitError } = useEntityForm<Expense, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateExpense(),
    update: useUpdateExpense(),
    onSaved,
    onDone,
    transform: async (draft) => {
      const amount = draft.amount ?? 0
      const isPaid = draft.isPaid ?? false
      const selected = lineItems.find((li) => li.id === draft.budgetLineItemId)
      const receiptObjectKey = receiptFile
        ? (await uploadBlob(receiptFile, 'receipt')).key
        : draft.receiptObjectKey ?? null
      return {
        ...draft,
        projectId,
        amount,
        // If they explicitly set the paid amount (incl. $0), keep it; else default to full.
        amountPaid: isPaid ? (paidTouched ? draft.amountPaid ?? 0 : resolvePaidAmount(true, draft.amountPaid ?? 0, amount)) : 0,
        paidDate: isPaid ? draft.paidDate || today() : null,
        budgetLineItemId: draft.budgetLineItemId || null,
        budgetLineItemTitle: selected?.title ?? draft.budgetLineItemTitle ?? '',
        categoryName: selected?.categoryName ?? draft.categoryName ?? '',
        roomTag: selected?.roomTag ?? draft.roomTag ?? '',
        receiptObjectKey,
        // Persist an explicit funding source (the select shows "Personal" by default but
        // leaves the draft '' until touched) so the stored row matches what was shown.
        fundingSource: draft.fundingSource || 'personal',
      }
    },
  })

  const openReceipt = async () => {
    if (!d.receiptObjectKey) return
    const url = await signedDownloadUrl(d.receiptObjectKey)
    if (url) window.open(url, '_blank', 'noopener')
  }

  // Display value: once touched, show exactly what they typed (allows $0); until then,
  // default a paid expense to the full amount.
  const paidValue = paidTouched
    ? d.amountPaid ?? 0
    : resolvePaidAmount(d.isPaid ?? false, d.amountPaid ?? 0, d.amount ?? 0)
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

  // OCR a receipt photo and pre-fill empty fields (the user confirms). Also attaches the
  // scanned image as the receipt so one tap both reads and saves it.
  const onScan = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setScanning(true)
    try {
      const r = await scanReceipt(file)
      setReceiptFile(file)
      setD((p) => ({
        ...p,
        vendorName: p.vendorName?.trim() ? p.vendorName : r.vendor ?? p.vendorName,
        amount: (p.amount ?? 0) > 0 ? p.amount : r.amount ?? p.amount,
        date: r.date ?? p.date,
      }))
      const found = [r.vendor && 'vendor', r.amount != null && 'amount', r.date && 'date'].filter(Boolean)
      toast.success(
        found.length ? `Scanned — filled ${found.join(', ')}. Double-check the values.` : 'Couldn’t read it — enter the details manually.',
      )
    } catch (err) {
      toast.error((err as Error).message || 'Receipt scan failed')
    } finally {
      setScanning(false)
    }
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
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
        <div className="form-grid">
          <Field label="Due date">
            {(p) => <input type="date" {...p} value={dateValue(d.dueDate)} onChange={date('dueDate')} />}
          </Field>
          <Field label="Expected payment" hint="When you expect to pay (drives cash flow). Defaults to the due date.">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.expectedPaymentDate)}
                onChange={date('expectedPaymentDate')}
              />
            )}
          </Field>
        </div>
      </Form.Section>

      <Form.Section title="Allocation">
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
        <div className="form-grid">
          <Field label="Category">
            {(p) => <input {...p} value={d.categoryName ?? ''} onChange={text('categoryName')} />}
          </Field>
          <Field label="Room tag">{(p) => <input {...p} value={d.roomTag ?? ''} onChange={text('roomTag')} />}</Field>
        </div>
      </Form.Section>

      <Form.Section title="Payment">
        {hasLoan && (
          <Field label="Funding source" hint="Track personal funds vs construction-loan spend.">
            {(p) => (
              <Select {...p} value={d.fundingSource || 'personal'} onChange={text('fundingSource')}>
                <option value="personal">Personal (cash / credit card)</option>
                <option value="loan">Construction loan</option>
              </Select>
            )}
          </Field>
        )}
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
              onChange={(v) => {
                setPaidTouched(true)
                setD((p) => ({ ...p, amountPaid: v }))
              }}
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
      </Form.Section>

      <Form.Section title="Receipt & notes">
        <input ref={scanRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={onScan} />
        <Button
          type="button"
          variant="secondary"
          loading={scanning}
          leadingIcon={<ScanLine size={16} />}
          onClick={() => scanRef.current?.click()}
        >
          Scan receipt to autofill
        </Button>
        <FileUploadField
          label="Receipt"
          cameraAccept="image/*"
          cameraLabel="Take photo"
          fileAccept="image/*,application/pdf"
          fileLabel="Choose file"
          onPick={setReceiptFile}
        />
        {(receiptFile || d.receiptObjectKey) && (
          <div className="row-between">
            <p className="muted" style={{ margin: 0 }}>{receiptFile ? receiptFile.name : 'Receipt attached'}</p>
            {d.receiptObjectKey && !receiptFile && (
              <Button type="button" size="sm" variant="secondary" onClick={openReceipt}>
                View receipt
              </Button>
            )}
          </div>
        )}
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>

      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save expense" />
    </Form>
  )
}
