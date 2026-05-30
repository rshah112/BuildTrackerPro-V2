// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TaskForm } from './TaskForm'
import type { BudgetLineItem, Vendor } from '../../domain/types'

vi.mock('./useTasks', () => ({
  useCreateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateTask: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

const vendors = [{ id: 'v1', name: 'Acme' } as Vendor]
const lineItems = [{ id: 'li1', categoryName: 'Framing', title: 'Lumber' } as BudgetLineItem]

function renderForm() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <TaskForm projectId="p1" vendors={vendors} lineItems={lineItems} onDone={() => {}} />
    </QueryClientProvider>,
  )
}

describe('TaskForm', () => {
  it('renders fields and links to a vendor + budget line', () => {
    renderForm()
    expect(screen.getByLabelText('Title')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Acme' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Framing / Lumber' })).toBeInTheDocument()
  })

  it('defaults status to todo', () => {
    renderForm()
    expect((screen.getByLabelText('Status') as HTMLSelectElement).value).toBe('todo')
  })
})
