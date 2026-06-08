import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ScanLine, Upload, ChevronDown } from 'lucide-react'
import type { BudgetLineItem, Expense } from '../../domain/types'
import { PAYMENT_METHODS } from '../../domain/enums'
import { balanceDue } from '../../lib/expenseMath'
import { fmt } from '../../lib/money'
import { uploadBlob, signedDownloadUrl } from '../../lib/r2'
import { scanReceipt, looksLikeInvoice } from '../../lib/receiptOcr'
import { getLastUsed, setLastUsed } from '../../lib/lastUsed'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Combobox, type ComboOption } from '../../components/ui/Combobox'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Button } from '../../components/ui/Button'
import { Form } from '../../components/ui/Form'
import { useToast } from '../../components/ui/Toast'
import { useEntityForm } from '../../lib/useEntityForm'
import { resolvePaidAmount } from './paidAmount'
import { useCreateExpense, useUpdateExpense, useExpenses } from './useExpenses'
import { useVendors } from '../vendors/useVendors'
import { useEnsureVendor } from '../vendors/useEnsureVendor'
import { VendorPicker } from '../vendors/VendorPicker'
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
    // Smart default: a fresh expense is Unpaid (a bill to track). Scanning a receipt flips it
    // to Paid; scanning an invoice keeps it Unpaid — see runExtraction.
    isPaid: false,
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
  // Editing an existing expense reveals the exact paid amount/date; new entries assume
  // "paid in full today" until the user taps Adjust.
  const [adjustPaid, setAdjustPaid] = useState(!!initial)
  // Auto-opened when OCR fills a tucked-away field (invoice # / due date) so it's visible.
  const [moreOpen, setMoreOpen] = useState(false)
  const hasLoan = (useLoan(projectId).data ?? []).length > 0
  const scanRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const toast = useToast()

  // Vendor suggestions: every distinct name from the vendor list + past expenses.
  const vendorsData = useVendors(projectId).data
  const expensesData = useExpenses(projectId).data
  const pastVendorNames = useMemo<string[]>(
    () => [...new Set((expensesData ?? []).map((e) => e.vendorName).filter(Boolean))],
    [expensesData],
  )
  const ensureVendor = useEnsureVendor(projectId)

  // Budget lines as a searchable, category-grouped picker (sorted so groups stay contiguous).
  const lineOptions = useMemo<ComboOption[]>(() => {
    const sorted = [...lineItems].sort(
      (a, b) => (a.categoryName || '').localeCompare(b.categoryName || '') || a.title.localeCompare(b.title),
    )
    return [
      { value: '', label: 'Unassigned' },
      ...sorted.map((li) => ({
        value: li.id,
        label: li.title,
        hint: li.roomTag || undefined,
        group: li.categoryName || 'Uncategorized',
      })),
    ]
  }, [lineItems])

  const methodOptions = useMemo<ComboOption[]>(() => PAYMENT_METHODS.map((m) => ({ value: m, label: m })), [])

  const blankDraft = useMemo<Draft>(
    () => ({
      ...blank(projectId),
      paymentMethod: getLastUsed('expense.paymentMethod') ?? '',
      fundingSource: getLastUsed('expense.fundingSource') ?? '',
    }),
    [projectId],
  )

  const { d, setD, text, date, busy, submit, submitError } = useEntityForm<Expense, Draft>({
    initial,
    blank: blankDraft,
    create: useCreateExpense(),
    update: useUpdateExpense(),
    onSaved,
    onDone,
    transform: async (draft) => {
      const amount = draft.amount ?? 0
      if (!(amount > 0)) throw new Error('Enter an amount greater than $0.')
      const isPaid = draft.isPaid ?? false
      const selected = lineItems.find((li) => li.id === draft.budgetLineItemId)
      const receiptObjectKey = receiptFile
        ? (await uploadBlob(receiptFile, 'receipt')).key
        : draft.receiptObjectKey ?? null
      // Remember the sticky payment choices so the next entry pre-fills them.
      if (isPaid && draft.paymentMethod) setLastUsed('expense.paymentMethod', draft.paymentMethod)
      if (hasLoan && draft.fundingSource) setLastUsed('expense.fundingSource', draft.fundingSource)
      // Auto-create a vendor profile for a typed name (best-effort; never blocks the save).
      try {
        await ensureVendor(draft.vendorName)
      } catch {
        /* vendor auto-create is best-effort */
      }
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

  const selectedLine = lineItems.find((li) => li.id === d.budgetLineItemId)
  const chooseLine = (value: string) => {
    const item = lineItems.find((li) => li.id === value)
    setD((p) => ({
      ...p,
      budgetLineItemId: item?.id ?? null,
      budgetLineItemTitle: item?.title ?? '',
      categoryName: item?.categoryName ?? p.categoryName ?? '',
      roomTag: item?.roomTag ?? p.roomTag ?? '',
    }))
  }
  const setPaid = (paid: boolean) =>
    setD((p) => ({ ...p, isPaid: paid, paidDate: paid ? p.paidDate || today() : null }))

  // OCR a scanned/uploaded receipt or invoice (image or PDF) and pre-fill empty fields. Also
  // attaches the file as the receipt and sets Paid via the receipt-vs-invoice heuristic.
  const runExtraction = async (file: File | null | undefined) => {
    if (!file) return
    setReceiptFile(file) // attach immediately so a failed/unsupported read still keeps the file
    setScanning(true)
    try {
      const r = await scanReceipt(file)
      const invoice = looksLikeInvoice(r)
      setD((p) => ({
        ...p,
        vendorName: p.vendorName?.trim() ? p.vendorName : r.vendor ?? p.vendorName,
        amount: (p.amount ?? 0) > 0 ? p.amount : r.amount ?? p.amount,
        date: r.date ?? p.date,
        invoiceNumber: p.invoiceNumber?.trim() ? p.invoiceNumber : r.invoiceNumber ?? p.invoiceNumber ?? '',
        dueDate: p.dueDate ?? r.dueDate ?? null,
        isPaid: !invoice,
        paidDate: invoice ? null : p.paidDate || today(),
      }))
      if (r.invoiceNumber || r.dueDate) setMoreOpen(true)
      const found = [
        r.vendor && 'vendor',
        r.amount != null && 'amount',
        r.date && 'date',
        r.invoiceNumber && 'invoice #',
      ].filter(Boolean)
      toast.success(
        found.length
          ? `${invoice ? 'Invoice' : 'Receipt'} read — filled ${found.join(', ')}. Double-check the values.`
          : 'Attached — couldn’t read it automatically. Enter the details below.',
      )
    } catch (err) {
      console.error('Receipt/invoice extraction failed', err)
      toast.error('Attached the file, but couldn’t read it automatically — enter the details below.')
    } finally {
      setScanning(false)
    }
  }
  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    runExtraction(file)
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <input ref={scanRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
        <input ref={uploadRef} type="file" accept="image/*,application/pdf" hidden onChange={onPick} />
        <div className="upload-choices">
          <Button type="button" variant="secondary" loading={scanning} leadingIcon={<ScanLine size={16} />} onClick={() => scanRef.current?.click()}>
            Scan
          </Button>
          <Button type="button" variant="secondary" loading={scanning} leadingIcon={<Upload size={16} />} onClick={() => uploadRef.current?.click()}>
            Upload receipt / invoice
          </Button>
        </div>
        {(receiptFile || d.receiptObjectKey) && (
          <div className="row-between">
            <p className="muted" style={{ margin: 0 }}>{receiptFile ? receiptFile.name : 'Receipt attached'}</p>
            {d.receiptObjectKey && !receiptFile && (
              <Button type="button" size="sm" variant="secondary" onClick={openReceipt}>
                View
              </Button>
            )}
          </div>
        )}

        <VendorPicker
          value={d.vendorName ?? ''}
          vendors={vendorsData ?? []}
          extraNames={pastVendorNames}
          onChange={(v) => setD((p) => ({ ...p, vendorName: v }))}
        />
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => setD((p) => ({ ...p, amount: v }))} />
        <Combobox
          label="Budget line"
          value={d.budgetLineItemId ?? ''}
          options={lineOptions}
          onChange={chooseLine}
          placeholder="Search your budget lines"
          emptyText="No matching budget line"
          hint={
            selectedLine
              ? `Category: ${selectedLine.categoryName || 'Uncategorized'}`
              : lineItems.length === 0
                ? 'No budget lines yet — add them in Budget first.'
                : 'Type to find a line; category fills in automatically.'
          }
        />
        <div className="form-grid">
          <Field label="Date">
            {(p) => <input type="date" {...p} value={dateValue(d.date)} onChange={date('date')} required />}
          </Field>
          <div className="field">
            <span className="field-label">Status</span>
            <SegmentedControl
              ariaLabel="Paid status"
              value={d.isPaid ? 'paid' : 'unpaid'}
              onChange={(v) => setPaid(v === 'paid')}
              segments={[
                { value: 'unpaid', label: 'Unpaid' },
                { value: 'paid', label: 'Paid' },
              ]}
            />
          </div>
        </div>
        {/* Funding source matters even on unpaid bills (a loan-funded invoice), so it lives in
            the fast path when a loan exists — not behind the Paid state. */}
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
      </Form.Section>

      {d.isPaid && (
        <Form.Section title="Payment">
          {adjustPaid ? (
            <>
              <CurrencyField
                label="Amount paid"
                value={paidValue}
                onChange={(v) => {
                  setPaidTouched(true)
                  setD((p) => ({ ...p, amountPaid: v }))
                }}
              />
              <Field label="Paid date">
                {(p) => <input type="date" {...p} value={dateValue(d.paidDate)} onChange={date('paidDate')} />}
              </Field>
              <p className="muted">Balance due: {fmt(balance)}</p>
            </>
          ) : (
            <div className="row-between">
              <p className="muted" style={{ margin: 0 }}>Paid in full today</p>
              <Button type="button" size="sm" variant="secondary" onClick={() => setAdjustPaid(true)}>
                Adjust
              </Button>
            </div>
          )}
          <Combobox
            label="Payment method"
            value={d.paymentMethod ?? ''}
            options={methodOptions}
            onChange={(v) => setD((p) => ({ ...p, paymentMethod: v }))}
            allowCustom
            placeholder="Check, ACH, Credit card…"
          />
        </Form.Section>
      )}

      <details className="more-details" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
        <summary>
          <span>More details</span>
          <ChevronDown size={16} aria-hidden />
        </summary>
        <div className="more-details-body">
          <div className="form-grid">
            <Field label="Invoice #">
              {(p) => <input {...p} value={d.invoiceNumber ?? ''} onChange={text('invoiceNumber')} />}
            </Field>
            <Field label="Due date">
              {(p) => <input type="date" {...p} value={dateValue(d.dueDate)} onChange={date('dueDate')} />}
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Expected payment" hint="Drives cash flow. Defaults to the due date.">
              {(p) => <input type="date" {...p} value={dateValue(d.expectedPaymentDate)} onChange={date('expectedPaymentDate')} />}
            </Field>
            <Field label="Room tag">
              {(p) => <input {...p} value={d.roomTag ?? ''} onChange={text('roomTag')} />}
            </Field>
          </div>
          {!selectedLine && (
            <Field label="Category" hint="Used when no budget line is selected.">
              {(p) => <input {...p} value={d.categoryName ?? ''} onChange={text('categoryName')} />}
            </Field>
          )}
          <Field label="Reference">
            {(p) => <input {...p} value={d.paymentReference ?? ''} onChange={text('paymentReference')} />}
          </Field>
          <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
        </div>
      </details>

      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save expense" />
    </Form>
  )
}
