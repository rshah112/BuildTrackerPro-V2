// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChangeOrderForm } from './ChangeOrderForm'
import type { BudgetLineItem } from '../../domain/types'

vi.mock('./useChangeOrders', () => ({
  useCreateChangeOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateChangeOrder: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const lineItems = [
  { id: 'li1', categoryName: 'Framing', title: 'Lumber' } as BudgetLineItem,
]

function renderForm() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <ChangeOrderForm
        projectId="p1"
        lineItems={lineItems}
        onSaved={async () => {}}
        onDone={() => {}}
      />
    </QueryClientProvider>,
  )
}

describe('ChangeOrderForm', () => {
  it('renders the key fields including status and the budget-line option', () => {
    renderForm()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Framing / Lumber' })).toBeInTheDocument()
  })

  it('defaults the status to pending', () => {
    renderForm()
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('pending')
  })
})
