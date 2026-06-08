// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Combobox, type ComboOption } from './Combobox'

const OPTIONS: ComboOption[] = [
  { value: '1', label: 'Framing labor', hint: 'Framing', group: 'Framing' },
  { value: '2', label: 'Framing lumber', hint: 'Framing', group: 'Framing' },
  { value: '3', label: 'Foundation pour', hint: 'Foundation', group: 'Foundation' },
]

describe('Combobox (select mode)', () => {
  it('shows the selected option label when closed', () => {
    render(<Combobox label="Budget line" value="2" options={OPTIONS} onChange={() => {}} />)
    expect((screen.getByLabelText('Budget line') as HTMLInputElement).value).toBe('Framing lumber')
  })

  it('filters options as you type', () => {
    render(<Combobox label="Budget line" value="" options={OPTIONS} onChange={() => {}} />)
    const input = screen.getByLabelText('Budget line')
    fireEvent.focus(input)
    expect(screen.getAllByRole('option')).toHaveLength(3)
    fireEvent.change(input, { target: { value: 'found' } })
    const opts = screen.getAllByRole('option')
    expect(opts).toHaveLength(1)
    expect(opts[0]).toHaveTextContent('Foundation pour')
  })

  it('selecting an option reports value and option', () => {
    const onChange = vi.fn()
    render(<Combobox label="Budget line" value="" options={OPTIONS} onChange={onChange} />)
    const input = screen.getByLabelText('Budget line')
    fireEvent.focus(input)
    fireEvent.mouseDown(screen.getByText('Foundation pour'))
    expect(onChange).toHaveBeenCalledWith('3', OPTIONS[2])
  })

  it('keyboard: ArrowDown then Enter picks the highlighted option', () => {
    const onChange = vi.fn()
    render(<Combobox label="Budget line" value="" options={OPTIONS} onChange={onChange} />)
    const input = screen.getByLabelText('Budget line')
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'ArrowDown' }) // 0 -> 1
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('2', OPTIONS[1])
  })

  it('shows the empty text when nothing matches', () => {
    render(<Combobox label="Budget line" value="" options={OPTIONS} onChange={() => {}} emptyText="No lines" />)
    const input = screen.getByLabelText('Budget line')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No lines')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })
})

describe('Combobox (free mode)', () => {
  it('commits typed text live as the value', () => {
    const onChange = vi.fn()
    render(<Combobox label="Vendor" value="" options={[]} onChange={onChange} allowCustom />)
    const input = screen.getByLabelText('Vendor')
    fireEvent.change(input, { target: { value: 'Ace Hardware' } })
    expect(onChange).toHaveBeenCalledWith('Ace Hardware')
  })

  it('shows the free value directly', () => {
    render(<Combobox label="Vendor" value="Home Depot" options={[]} onChange={() => {}} allowCustom />)
    expect((screen.getByLabelText('Vendor') as HTMLInputElement).value).toBe('Home Depot')
  })
})
