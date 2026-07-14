// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ToastProvider, useToast } from './Toast'

function Trigger() {
  const toast = useToast()
  return (
    <button onClick={() => toast.success('Saved')} type="button">
      go
    </button>
  )
}

describe('Toast', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a toast on demand and auto-dismisses it', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    expect(screen.queryByRole('status')).toBeNull()

    act(() => {
      screen.getByRole('button', { name: 'go' }).click()
    })
    expect(screen.getByRole('status')).toHaveTextContent('Saved')

    act(() => {
      vi.advanceTimersByTime(3500)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('throws if useToast is used outside the provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Trigger />)).toThrow(/ToastProvider/)
    spy.mockRestore()
  })

  it('pauses dismissal while the toast is being inspected', () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    )
    act(() => screen.getByRole('button', { name: 'go' }).click())
    const toast = screen.getByRole('status')
    fireEvent.mouseEnter(toast)
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.getByRole('status')).toBeInTheDocument()
    fireEvent.mouseLeave(toast)
    act(() => vi.advanceTimersByTime(3500))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
