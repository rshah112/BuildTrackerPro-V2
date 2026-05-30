// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Sheet } from './Sheet'

describe('Sheet', () => {
  it('renders nothing when closed', () => {
    render(
      <Sheet open={false} onClose={() => {}} title="Edit">
        <p>body</p>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a labelled modal dialog when open', () => {
    render(
      <Sheet open onClose={() => {}} title="Edit project">
        <input aria-label="Name" />
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Edit project')
  })

  it('closes on Escape and on the close button', () => {
    const onClose = vi.fn()
    render(
      <Sheet open onClose={onClose} title="Edit">
        <input aria-label="Name" />
      </Sheet>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
