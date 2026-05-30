// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Field } from './Field'

describe('Field', () => {
  it('associates the label with the control (getByLabelText works)', () => {
    render(<Field label="Vendor">{(p) => <input {...p} defaultValue="Acme" />}</Field>)
    const input = screen.getByLabelText('Vendor') as HTMLInputElement
    expect(input.value).toBe('Acme')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('wires aria-invalid + aria-describedby to an alert when in error', () => {
    render(<Field label="Amount" error="Required">{(p) => <input {...p} />}</Field>)
    const input = screen.getByLabelText('Amount')
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Required')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input.getAttribute('aria-describedby')).toBe(alert.id)
  })

  it('shows a hint when there is no error', () => {
    render(
      <Field label="Email" hint="We never share it">
        {(p) => <input {...p} />}
      </Field>,
    )
    const input = screen.getByLabelText('Email')
    expect(screen.getByText('We never share it')).toBeInTheDocument()
    expect(input.getAttribute('aria-describedby')).toBeTruthy()
  })
})
