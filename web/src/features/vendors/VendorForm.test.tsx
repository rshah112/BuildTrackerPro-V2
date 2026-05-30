// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VendorForm } from './VendorForm'

vi.mock('./useVendors', () => ({
  useCreateVendor: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateVendor: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))

function renderForm() {
  const qc = new QueryClient()
  return render(
    <QueryClientProvider client={qc}>
      <VendorForm projectId="p1" onDone={() => {}} />
    </QueryClientProvider>,
  )
}

describe('VendorForm', () => {
  it('renders labelled fields and a save button', () => {
    renderForm()
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Trade')).toBeInTheDocument()
    expect(screen.getByLabelText('Phone')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('requires a name', () => {
    renderForm()
    expect(screen.getByLabelText('Name')).toBeRequired()
  })
})
