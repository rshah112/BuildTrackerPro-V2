import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { ScanLine, Upload, ChevronDown, CircleCheck, TriangleAlert, Sparkles } from 'lucide-react'
import type { BudgetLineItem, Expense } from '../../domain/types'
import { FUNDING_SOURCES, FUNDING_SOURCE_LABEL, PAYMENT_METHODS, normalizeFundingSource } from '../../domain/enums'
import { balanceDue } from '../../lib/expenseMath'
import { fmt } from '../../lib/money'
import { uploadBlob, signedDownloadUrl } from '../../lib/r2'
import {
  scanReceipt,
  type ReceiptFieldName,
  type ReceiptScan,
} from '../../lib/receiptOcr'
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
import { useCreateLineItem } from '../budget/useBudget'
import { RoomTagPicker } from '../rooms/RoomTagPicker'
import { localDateISO } from '../../lib/date'
import { useChangeOrders } from '../changeOrders/useChangeOrders'

type Draft = Partial<Omit<Expense, 'id' | 'owner'>>

const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const SCAN_FIELD_LABEL: Record<ReceiptFieldName, string> = {
  vendor: 'Vendor',
  amount: 'Amount',
  date: 'Date',
  invoiceNumber: 'Invoice #',
  dueDate: 'Due date',
}

function scanFieldValue(name: ReceiptFieldName, value: string | number): string {
  return name === 'amount' && typeof value === 'number'
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)
    : String(value)
}

function ScanReview({
  scan,
  onUse,
}: {
  scan: ReceiptScan
  onUse: (name: ReceiptFieldName, value: string | number) => void
}) {
  const found = (Object.keys(SCAN_FIELD_LABEL) as ReceiptFieldName[]).filter(
    (name) => scan.fields[name].value != null,
  )
  const review = new Set(scan.needsReview)
  const typeConflict = scan.warnings.includes('document_type_conflict')
  const needsPaymentReview =
    typeConflict || scan.documentType === 'unknown' || scan.documentTypeConfidence < 0.7
  const clean =
    found.length > 0 &&
    review.size === 0 &&
    !scan.extraction.manualFallback &&
    !needsPaymentReview
  const method = scan.extraction.usedAi && scan.extraction.usedLocalOcr
    ? 'AI + on-device verification'
    : scan.extraction.usedAi
      ? 'Document AI'
      : scan.extraction.usedLocalOcr
        ? 'On-device text recognition'
        : 'Manual entry'

  return (
    <aside className={`scan-review ${clean ? 'scan-review-clean' : 'scan-review-warn'}`} aria-live="polite">
      <div className="scan-review-head">
        <span className="scan-review-icon">
          {clean ? <CircleCheck size={18} aria-hidden /> : <TriangleAlert size={18} aria-hidden />}
        </span>
        <span className="scan-review-title">
          <strong>{clean ? 'Scan looks reliable' : 'Review the highlighted scan results'}</strong>
          <small>
            {scan.documentType === 'unknown' ? 'Document' : scan.documentType[0].toUpperCase() + scan.documentType.slice(1)}
            {' · '}{method}
          </small>
        </span>
      </div>
      {found.length > 0 ? (
        <div className="scan-field-chips" aria-label="Detected fields">
          {found.filter((name) => !review.has(name)).map((name) => {
            const field = scan.fields[name]
            return (
              <span
                className={`scan-field-chip ${review.has(name) ? 'needs-review' : 'is-confident'}`}
                key={name}
              >
                {SCAN_FIELD_LABEL[name]} · {Math.round(field.confidence * 100)}%
              </span>
            )
          })}
        </div>
      ) : (
        <p>Nothing reliable was detected. The file is attached; enter the details manually.</p>
      )}
      {review.size > 0 && (
        <>
          <p>
            Check {Array.from(review, (name) => SCAN_FIELD_LABEL[name]).join(', ')} against the original before saving.
          </p>
          <div className="scan-candidate-list" aria-label="Scan suggestions needing review">
            {found.filter((name) => review.has(name)).map((name) => {
              const field = scan.fields[name]
              if (field.value == null) return null
              return (
                <div className="scan-candidate" key={name}>
                  <span className="scan-candidate-copy">
                    <small>{SCAN_FIELD_LABEL[name]} suggestion · {Math.round(field.confidence * 100)}%</small>
                    <strong>{scanFieldValue(name, field.value)}</strong>
                    {field.evidence && <span>Detected near “{field.evidence}”</span>}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={`Use ${SCAN_FIELD_LABEL[name]} suggestion: ${scanFieldValue(name, field.value)}`}
                    onClick={() => onUse(name, field.value!)}
                  >
                    Use
                  </Button>
                </div>
              )
            })}
          </div>
        </>
      )}
      {needsPaymentReview && (
        <p>
          The scan could not confidently tell whether this is a paid receipt or an unpaid invoice. Confirm Paid or Unpaid before saving.
        </p>
      )}
    </aside>
  )
}

function blank(projectId: string): Draft {
  return {
    projectId,
    amount: 0,
    amountPaid: 0,
    vendorName: '',
    invoiceNumber: '',
    date: localDateISO(),
    dueDate: null,
    expectedPaymentDate: null,
    paidDate: localDateISO(),
    paymentMethod: '',
    paymentReference: '',
    categoryName: '',
    roomTag: '',
    budgetLineItemId: null,
    budgetLineItemTitle: '',
    notes: '',
    // Smart default: a fresh expense is Unpaid (a bill to track). Scanning a receipt flips it
    // to Paid only when the classifier is confident; uncertain scans stay Unpaid for review.
    isPaid: false,
    receiptObjectKey: null,
    vendorId: null,
    changeOrderId: null,
    fundingSource: '',
    retainageAmount: 0,
  }
}

export function ExpenseForm({
  projectId,
  lineItems,
  initial,
  onSaved,
  onPostSaveError,
  onDone,
}: {
  projectId: string
  lineItems: BudgetLineItem[]
  initial?: Expense
  onSaved: (expense: Expense) => Promise<void>
  onPostSaveError?: (error: unknown, expense: Expense) => void | Promise<void>
  onDone: () => void
}) {
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  // Once the user edits "Amount paid", honor their literal value (incl. $0) instead of
  // re-deriving the full-amount default on every render.
  const [paidTouched, setPaidTouched] = useState(false)
  // OCR may replace untouched defaults, but it must never undo an explicit date/status
  // choice—or silently rewrite those fields while editing an existing expense.
  const dateTouched = useRef(!!initial)
  const paidStatusTouched = useRef(!!initial)
  // Editing an existing expense reveals the exact paid amount/date; new entries assume
  // "paid in full today" until the user taps Adjust.
  const [adjustPaid, setAdjustPaid] = useState(!!initial)
  // Auto-opened when OCR fills a tucked-away field (invoice # / due date) so it's visible.
  const [moreOpen, setMoreOpen] = useState(false)
  const hasLoan = (useLoan(projectId).data ?? []).length > 0
  const { data: changeOrders = [] } = useChangeOrders(projectId)
  const scanRef = useRef<HTMLInputElement>(null)
  const uploadRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ReceiptScan | null>(null)
  const toast = useToast()

  // Vendor suggestions: every distinct name from the vendor list + past expenses.
  const vendorsData = useVendors(projectId).data
  const expensesData = useExpenses(projectId).data
  const pastVendorNames = useMemo<string[]>(
    () => [...new Set((expensesData ?? []).map((e) => e.vendorName).filter(Boolean))],
    [expensesData],
  )
  const ensureVendor = useEnsureVendor(projectId)
  const createLineItem = useCreateLineItem()
  // Budget lines created inline via the picker's "+ Create" this session — merged into the options
  // immediately so the new line is selectable and shows its label before the list refetches.
  const [createdLines, setCreatedLines] = useState<BudgetLineItem[]>([])
  const allLines = useMemo(
    () => [...lineItems, ...createdLines.filter((c) => !lineItems.some((l) => l.id === c.id))],
    [lineItems, createdLines],
  )
  const projectRooms = useMemo(() => [...new Set(allLines.map((li) => li.roomTag).filter(Boolean))], [allLines])

  // Budget lines as a searchable, category-grouped picker (sorted so groups stay contiguous).
  const lineOptions = useMemo<ComboOption[]>(() => {
    const sorted = [...allLines].sort(
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
  }, [allLines])

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
    onPostSaveError,
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
      // Persist its id when available so tax rollups survive a later vendor rename.
      const sameVendorAsBefore =
        !!initial &&
        (initial.vendorName ?? '').trim().toLocaleLowerCase() ===
          (draft.vendorName ?? '').trim().toLocaleLowerCase()
      let vendorId = sameVendorAsBefore ? draft.vendorId ?? null : null
      try {
        const vendor = await ensureVendor(draft.vendorName)
        vendorId = vendor?.id ?? null
      } catch {
        /* vendor auto-create is best-effort */
      }
      const amountPaid = isPaid
        ? paidTouched
          ? draft.amountPaid ?? 0
          : resolvePaidAmount(true, draft.amountPaid ?? 0, amount)
        : 0
      const remaining = balanceDue({ amount, amountPaid, isPaid })
      const retainageAmount = draft.retainageAmount ?? 0
      if (retainageAmount < 0 || retainageAmount > remaining) {
        throw new Error(`Retainage must be between $0 and the ${fmt(remaining)} remaining balance.`)
      }
      return {
        ...draft,
        projectId,
        amount,
        // If they explicitly set the paid amount (incl. $0), keep it; else default to full.
        amountPaid,
        paidDate: isPaid ? draft.paidDate || localDateISO() : null,
        vendorId,
        changeOrderId: draft.changeOrderId || null,
        budgetLineItemId: draft.budgetLineItemId || null,
        budgetLineItemTitle: selected?.title ?? draft.budgetLineItemTitle ?? '',
        categoryName: selected?.categoryName ?? draft.categoryName ?? '',
        roomTag: selected?.roomTag ?? draft.roomTag ?? '',
        receiptObjectKey,
        fundingSource: normalizeFundingSource(draft.fundingSource),
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

  const selectedLine = allLines.find((li) => li.id === d.budgetLineItemId)
  const chooseLine = (value: string) => {
    const item = allLines.find((li) => li.id === value)
    setD((p) => ({
      ...p,
      budgetLineItemId: item?.id ?? null,
      budgetLineItemTitle: item?.title ?? '',
      categoryName: item?.categoryName ?? p.categoryName ?? '',
      roomTag: item?.roomTag ?? p.roomTag ?? '',
    }))
  }
  // Inline quick-add: spin up a STUB budget line ($0 budget, current/Uncategorized category) from
  // the typed name and select it — the owner sets the budget amount later in Budget. Same "type it
  // and it becomes a real, editable record" idea as the vendor auto-create.
  const createLine = async (title: string) => {
    const li = await createLineItem.mutateAsync({
      projectId,
      categoryName: d.categoryName?.trim() || 'Uncategorized',
      costCode: '',
      title,
      roomTag: d.roomTag ?? '',
      budget: 0,
      actual: 0,
      committed: 0,
      notes: '',
      isPinned: false,
      isAllowance: false,
      allowanceAmount: 0,
    } as Partial<BudgetLineItem>)
    setCreatedLines((p) => [...p, li])
    setD((p) => ({
      ...p,
      budgetLineItemId: li.id,
      budgetLineItemTitle: li.title,
      categoryName: li.categoryName,
      roomTag: li.roomTag || p.roomTag || '',
    }))
    toast.success(`Added “${li.title}” to your budget — set its amount in Budget anytime.`)
  }
  const setPaid = (paid: boolean) => {
    paidStatusTouched.current = true
    setD((p) => ({ ...p, isPaid: paid, paidDate: paid ? p.paidDate || localDateISO() : null }))
  }

  const useScanSuggestion = (name: ReceiptFieldName, value: string | number) => {
    switch (name) {
      case 'vendor':
        setD((p) => ({ ...p, vendorName: String(value) }))
        break
      case 'amount':
        setD((p) => ({ ...p, amount: Number(value) }))
        break
      case 'date':
        dateTouched.current = true
        setD((p) => ({ ...p, date: String(value) }))
        break
      case 'invoiceNumber':
        setMoreOpen(true)
        setD((p) => ({ ...p, invoiceNumber: String(value) }))
        break
      case 'dueDate':
        setMoreOpen(true)
        setD((p) => ({ ...p, dueDate: String(value) }))
        break
    }
  }

  // OCR a scanned/uploaded receipt or invoice (image or PDF) and pre-fill empty fields. Also
  // attaches the file and changes paid status only when document classification is confident.
  const runExtraction = async (file: File | null | undefined) => {
    if (!file) return
    setReceiptFile(file) // attach immediately so a failed/unsupported read still keeps the file
    setD((current) => current) // the attachment itself is an unsaved change, even if OCR fails
    setScanResult(null)
    setScanning(true)
    try {
      const r = await scanReceipt(file)
      setScanResult(r)
      const reliableType =
        r.documentTypeConfidence >= 0.7 &&
        r.documentType !== 'unknown' &&
        !r.warnings.includes('document_type_conflict')
      const invoice = r.documentType === 'invoice'
      const autoClassifyPayment = reliableType && !paidStatusTouched.current
      const accepted = <K extends ReceiptFieldName>(name: K) =>
        r.fields[name].needsReview ? null : r.fields[name].value
      const vendor = accepted('vendor') as string | null
      const amount = accepted('amount') as number | null
      const receiptDate = accepted('date') as string | null
      const invoiceNumber = accepted('invoiceNumber') as string | null
      const dueDate = accepted('dueDate') as string | null
      setD((p) => ({
        ...p,
        vendorName: p.vendorName?.trim() ? p.vendorName : vendor ?? p.vendorName,
        amount: (p.amount ?? 0) > 0 ? p.amount : amount ?? p.amount,
        date: dateTouched.current ? p.date : receiptDate ?? p.date,
        invoiceNumber: p.invoiceNumber?.trim() ? p.invoiceNumber : invoiceNumber ?? p.invoiceNumber ?? '',
        dueDate: p.dueDate ?? dueDate ?? null,
        isPaid: autoClassifyPayment ? !invoice : p.isPaid,
        paidDate: autoClassifyPayment ? (invoice ? null : p.paidDate || localDateISO()) : p.paidDate,
      }))
      if (invoiceNumber || dueDate) setMoreOpen(true)
      const found = [
        vendor && 'vendor',
        amount != null && 'amount',
        receiptDate && 'date',
        invoiceNumber && 'invoice #',
      ].filter(Boolean)
      if (found.length) toast.success(`Scan filled ${found.join(', ')}. Review any amber fields before saving.`)
      else toast.show('File attached — the scan needs manual review.')
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
  const submitExpense = (event: FormEvent) => {
    if (scanning) {
      event.preventDefault()
      toast.show('Wait for the document scan to finish before saving.')
      return
    }
    void submit(event)
  }

  return (
    <Form onSubmit={submitExpense}>
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
        <p className="scan-privacy">
          For automatic extraction, document content is securely processed by Cloudflare Workers AI. Images may also be checked on this device; the original remains attached to this project.
        </p>
        {scanning && (
          <div className="scan-progress" role="status">
            <Sparkles size={17} aria-hidden />
            <span><strong>Reading document…</strong><small>Checking layout, totals, dates, and invoice signals</small></span>
          </div>
        )}
        {scanResult && <ScanReview scan={scanResult} onUse={useScanSuggestion} />}
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
          onCreate={createLine}
          placeholder="Search or add a budget line"
          emptyText="No matching budget line"
          hint={
            selectedLine
              ? `Category: ${selectedLine.categoryName || 'Uncategorized'}`
              : 'Type to find a line — or add a new one and set its budget later.'
          }
        />
        <div className="form-grid">
          <Field label="Date">
            {(p) => (
              <input
                type="date"
                {...p}
                value={dateValue(d.date)}
                onChange={(event) => {
                  dateTouched.current = true
                  date('date')(event)
                }}
                required
              />
            )}
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
          <Field
            label="Whose money paid this?"
            hint="Drives who you owe. Money you or the builder front is reimbursed from a draw later — that reimbursement is cash only and never changes the budget."
          >
            {(p) => (
              <Select {...p} value={normalizeFundingSource(d.fundingSource)} onChange={text('fundingSource')}>
                {FUNDING_SOURCES.map((source) => (
                  <option key={source} value={source}>
                    {FUNDING_SOURCE_LABEL[source]}
                  </option>
                ))}
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
            <RoomTagPicker
              value={d.roomTag ?? ''}
              rooms={projectRooms}
              onChange={(r) => setD((p) => ({ ...p, roomTag: r }))}
            />
          </div>
          {!selectedLine && (
            <Field label="Category" hint="Used when no budget line is selected.">
              {(p) => <input {...p} value={d.categoryName ?? ''} onChange={text('categoryName')} />}
            </Field>
          )}
          <Field label="Reference">
            {(p) => <input {...p} value={d.paymentReference ?? ''} onChange={text('paymentReference')} />}
          </Field>
          {changeOrders.length > 0 && (
            <Field label="Related change order" hint="Link the invoice so the same cost is not counted twice.">
              {(p) => (
                <Select {...p} value={d.changeOrderId ?? ''} onChange={text('changeOrderId')}>
                  <option value="">None</option>
                  {changeOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.title} · {fmt(order.amount)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <CurrencyField
            label="Retainage held"
            value={d.retainageAmount ?? 0}
            onChange={(v) => setD((p) => ({ ...p, retainageAmount: v }))}
          />
          <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
        </div>
      </details>

      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy || scanning} onCancel={onDone} saveLabel="Save expense" />
    </Form>
  )
}
