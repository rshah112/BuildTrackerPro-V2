// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ui/Toast'
import { NotificationSettingsScreen } from './NotificationSettingsScreen'

const { prefsState, saveMock } = vi.hoisted(() => ({
  prefsState: { data: [] as unknown[], isLoading: false, error: null as Error | null },
  saveMock: vi.fn(),
}))

vi.mock('./useNotificationPrefs', async (importOriginal) => {
  const original = await importOriginal<typeof import('./useNotificationPrefs')>()
  return {
    ...original,
    useNotificationPrefs: () => prefsState,
    useSaveNotificationPrefs: () => ({ mutateAsync: saveMock, isPending: false }),
  }
})

vi.mock('./NotifyControl', () => ({
  NotifyControl: () => <div>Notification control</div>,
}))

const renderScreen = () =>
  render(
    <ToastProvider>
      <NotificationSettingsScreen />
    </ToastProvider>,
  )

describe('NotificationSettingsScreen query states', () => {
  beforeEach(() => {
    prefsState.data = []
    prefsState.isLoading = false
    prefsState.error = null
    saveMock.mockReset()
  })

  it('keeps the header visible while settings load and withholds the default form', () => {
    prefsState.isLoading = true

    renderScreen()

    expect(screen.getByRole('heading', { name: 'Reminder settings' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument()
  })

  it('shows a read error instead of an editable default form', () => {
    prefsState.error = new Error('preferences unavailable')

    renderScreen()

    expect(screen.getByRole('heading', { name: 'Reminder settings' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t load reminder settings: preferences unavailable',
    )
    expect(screen.queryByRole('button', { name: 'Save settings' })).not.toBeInTheDocument()
  })
})
