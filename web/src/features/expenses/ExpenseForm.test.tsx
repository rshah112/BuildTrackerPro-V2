// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
const h = vi.hoisted(() => ({ loan: [] as unknown[] }))
vi.mock('../loan/useLoan', () => ({ useLoan: () => ({ data: h.loan }) }))
vi.mock('../../components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))

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

afterEach(() => {
  h.loan = []
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
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.mouseDown(screen.getByText('Foundation pour'))
    expect(screen.getByText('Category: Foundation')).toBeInTheDocument()
  })

  it('tucks rarely-used fields behind a collapsed "More details" disclosure', () => {
    renderForm()
    const details = document.querySelector('details.more-details') as HTMLDetailsElement
    expect(details.open).toBe(false)
    expect(screen.getByLabelText('Invoice #')).toBeInTheDocument()
    expect(screen.getByLabelText('Reference')).toBeInTheDocument()
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
})
