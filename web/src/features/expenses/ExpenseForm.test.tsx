// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { BudgetLineItem } from '../../domain/types'
import { ExpenseForm } from './ExpenseForm'

vi.mock('./useExpenses', () => ({
  useCreateExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateExpense: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useExpenses: () => ({ data: [] }),
}))
vi.mock('../vendors/useVendors', () => ({
  useVendors: () => ({ data: [{ id: 'v1', name: 'Existing Vendor', trade: 'Plumbing' }] }),
  useCreateVendor: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
const h = vi.hoisted(() => ({ loan: [] as unknown[], scanReceipt: vi.fn() }))
vi.mock('../loan/useLoan', () => ({ useLoan: () => ({ data: h.loan }) }))
vi.mock('../../lib/receiptOcr', () => ({ scanReceipt: h.scanReceipt }))
vi.mock('../changeOrders/useChangeOrders', () => ({
  useChangeOrders: () => ({ data: [{ id: 'co1', title: 'Added framing', amount: 750 }] }),
}))
vi.mock('../../components/ui/Toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), show: vi.fn() }),
}))

const line = (id: string, title: string, categoryName: string): BudgetLineItem => ({
  id,
  owner: 'o',
  projectId: 'p1',
  costCode: '',
  title,
  categoryName,
  roomTag: '',
  budget: 1000,
  actual: 0,
  committed: 0,
  notes: '',
  isPinned: false,
  isAllowance: false,
  allowanceAmount: 0,
  createdAt: '2026-01-01',
})

const LINES = [line('l1', 'Lumber', 'Framing'), line('l2', 'Foundation pour', 'Foundation')]

function renderForm() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <ExpenseForm projectId="p1" lineItems={LINES} onSaved={async () => {}} onDone={() => {}} />
    </QueryClientProvider>,
  )
}

const scanField = <T extends string | number>(value: T | null, confidence: number, needsReview = false) => ({
  value,
  confidence,
  evidence: value == null ? null : String(value),
  source: value == null ? ('none' as const) : ('ai' as const),
  needsReview,
})

function scannedDocument({
  type = 'receipt',
  typeConfidence = 0.95,
  reviewed = [],
  warnings = [],
}: {
  type?: 'receipt' | 'invoice' | 'unknown'
  typeConfidence?: number
  reviewed?: Array<'vendor' | 'amount' | 'date' | 'invoiceNumber' | 'dueDate'>
  warnings?: string[]
} = {}) {
  const needs = (name: string) => reviewed.includes(name as (typeof reviewed)[number])
  return {
    vendor: 'Acme Supply',
    amount: 123.45,
    date: '2026-06-15',
    invoiceNumber: type === 'invoice' ? 'INV-42' : null,
    dueDate: type === 'invoice' ? '2026-07-15' : null,
    raw: '',
    documentType: type,
    documentTypeConfidence: typeConfidence,
    fields: {
      vendor: scanField('Acme Supply', 0.94, needs('vendor')),
      amount: scanField(123.45, 0.96, needs('amount')),
      date: scanField('2026-06-15', 0.93, needs('date')),
      invoiceNumber: scanField(type === 'invoice' ? 'INV-42' : null, type === 'invoice' ? 0.91 : 0, needs('invoiceNumber')),
      dueDate: scanField(type === 'invoice' ? '2026-07-15' : null, type === 'invoice' ? 0.9 : 0, needs('dueDate')),
    },
    needsReview: reviewed,
    warnings,
    extraction: { usedAi: true, usedLocalOcr: false, manualFallback: false },
  }
}

function uploadTestReceipt(container: HTMLElement) {
  const input = container.querySelector('input[accept="image/*,application/pdf"]') as HTMLInputElement
  expect(input).toBeInTheDocument()
  fireEvent.change(input, {
    target: { files: [new File(['receipt'], 'receipt.png', { type: 'image/png' })] },
  })
}

afterEach(() => {
  h.loan = []
  h.scanReceipt.mockReset()
})

describe('ExpenseForm redesign', () => {
  it('renders the fast-path fields plus scan/upload', () => {
    renderForm()
    expect(screen.getByLabelText('Vendor')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
    expect(screen.getByLabelText('Budget line')).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Scan' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload receipt / invoice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save expense' })).toBeInTheDocument()
  })

  it('defaults to Unpaid and reveals the Payment section only when marked Paid', () => {
    renderForm()
    expect(screen.getByRole('radio', { name: 'Unpaid' })).toBeChecked()
    expect(screen.queryByLabelText('Payment method')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Paid' }))
    expect(screen.getByLabelText('Payment method')).toBeInTheDocument()
    expect(screen.getByText('Paid in full today')).toBeInTheDocument()
  })

  it('suggests a known vendor on focus (autocomplete)', () => {
    renderForm()
    fireEvent.focus(screen.getByLabelText('Vendor'))
    expect(screen.getByText('Existing Vendor')).toBeInTheDocument()
  })

  it('budget-line combobox filters and auto-fills the category', () => {
    renderForm()
    const bl = screen.getByLabelText('Budget line')
    fireEvent.focus(bl)
    fireEvent.change(bl, { target: { value: 'found' } })
    expect(screen.getByRole('option', { name: 'Foundation pour' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Lumber' })).not.toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('Foundation pour'))
    expect(screen.getByText('Category: Foundation')).toBeInTheDocument()
  })

  it('tucks rarely-used fields behind a collapsed "More details" disclosure', () => {
    renderForm()
    const details = document.querySelector('details.more-details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(screen.getByLabelText('Invoice #')).toBeInTheDocument()
    expect(screen.getByLabelText('Reference')).toBeInTheDocument()
    expect(screen.getByLabelText('Related change order')).toBeInTheDocument()
    expect(screen.getByLabelText('Notes')).toBeInTheDocument()
  })

  it('shows Funding source when a loan exists — even while Unpaid (not gated on Paid)', () => {
    h.loan = [{ id: 'loan1' }]
    renderForm()
    expect(screen.getByRole('radio', { name: 'Unpaid' })).toBeChecked()
    expect(screen.getByLabelText('Funding source')).toBeInTheDocument()
  })

  it('hides Funding source when there is no loan', () => {
    renderForm()
    expect(screen.queryByLabelText('Funding source')).not.toBeInTheDocument()
  })

  it('auto-fills only confident scan fields and classifies a reliable receipt as paid', async () => {
    h.scanReceipt.mockResolvedValue(scannedDocument())
    const { container } = renderForm()

    uploadTestReceipt(container)

    expect(await screen.findByText('Scan looks reliable')).toBeInTheDocument()
    expect(screen.getByLabelText('Vendor')).toHaveValue('Acme Supply')
    expect(screen.getByLabelText('Amount')).toHaveValue('123.45')
    expect(screen.getByLabelText('Date')).toHaveValue('2026-06-15')
    expect(screen.getByRole('radio', { name: 'Paid' })).toBeChecked()
    expect(screen.getByText('Amount · 96%')).toBeInTheDocument()
  })

  it('does not auto-fill fields the scan marked for review', async () => {
    h.scanReceipt.mockResolvedValue(scannedDocument({ reviewed: ['vendor', 'amount'] }))
    const { container } = renderForm()

    uploadTestReceipt(container)

    expect(await screen.findByText('Review the highlighted scan results')).toBeInTheDocument()
    expect(screen.getByLabelText('Vendor')).toHaveValue('')
    expect(screen.getByLabelText('Amount')).toHaveValue('0')
    expect(screen.getByText('Check Vendor, Amount against the original before saving.')).toBeInTheDocument()
    expect(screen.getByText('Acme Supply')).toBeInTheDocument()
    expect(screen.getByText('$123.45')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use Vendor suggestion: Acme Supply' }))
    expect(screen.getByLabelText('Vendor')).toHaveValue('Acme Supply')
  })

  it('blocks saving until an in-flight scan has finished', async () => {
    let finishScan!: (value: ReturnType<typeof scannedDocument>) => void
    h.scanReceipt.mockImplementation(() => new Promise((resolve) => { finishScan = resolve }))
    const { container } = renderForm()

    uploadTestReceipt(container)

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save expense' })).toBeDisabled())
    finishScan(scannedDocument())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save expense' })).toBeEnabled())
  })

  it('preserves an explicit date and paid status when a later scan disagrees', async () => {
    h.scanReceipt.mockResolvedValue(scannedDocument({ type: 'invoice' }))
    const { container } = renderForm()
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-06-01' } })
    fireEvent.click(screen.getByRole('radio', { name: 'Paid' }))

    uploadTestReceipt(container)

    await waitFor(() => expect(screen.getByText('Scan looks reliable')).toBeInTheDocument())
    expect(screen.getByLabelText('Date')).toHaveValue('2026-06-01')
    expect(screen.getByRole('radio', { name: 'Paid' })).toBeChecked()
  })

  it('does not auto-classify paid status when AI and local OCR disagree on document type', async () => {
    h.scanReceipt.mockResolvedValue(scannedDocument({ warnings: ['document_type_conflict'] }))
    const { container } = renderForm()

    uploadTestReceipt(container)

    expect(await screen.findByText(/could not confidently tell whether this is a paid receipt/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Unpaid' })).toBeChecked()
  })

  it.each([
    ['a low-confidence type', { type: 'receipt' as const, typeConfidence: 0.5 }],
    ['an unknown document type', { type: 'unknown' as const, typeConfidence: 0.9 }],
  ])('requires payment-status review for %s', async (_label, scanOptions) => {
    h.scanReceipt.mockResolvedValue(scannedDocument(scanOptions))
    const { container } = renderForm()

    uploadTestReceipt(container)

    expect(await screen.findByText('Review the highlighted scan results')).toBeInTheDocument()
    expect(screen.queryByText('Scan looks reliable')).not.toBeInTheDocument()
    expect(screen.getByText(/could not confidently tell whether this is a paid receipt/)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Unpaid' })).toBeChecked()
  })
})
