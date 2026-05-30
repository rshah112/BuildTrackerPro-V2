// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CurrencyField, parseCurrency } from './CurrencyField'

describe('parseCurrency', () => {
  it('strips $ and commas to a number', () => {
    expect(parseCurrency('$1,200.50')).toBe(1200.5)
    expect(parseCurrency('100000')).toBe(100000)
    expect(parseCurrency('')).toBe(0)
    expect(parseCurrency('abc')).toBe(0)
  })
})

describe('CurrencyField', () => {
  it('is labelled and formats with separators when blurred', () => {
    render(<CurrencyField label="Construction budget" value={100000} onChange={() => {}} />)
    const input = screen.getByLabelText('Construction budget') as HTMLInputElement
    expect(input.value).toBe('100,000')
  })

  it('reports the parsed numeric value on change', () => {
    const onChange = vi.fn()
    render(<CurrencyField label="Amount" value={0} onChange={onChange} />)
    const input = screen.getByLabelText('Amount')
    fireEvent.change(input, { target: { value: '2500' } })
    expect(onChange).toHaveBeenCalledWith(2500)
  })
})
