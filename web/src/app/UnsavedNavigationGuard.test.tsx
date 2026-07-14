// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  createMemoryRouter,
  Outlet,
  RouterProvider,
  useNavigate,
  type InitialEntry,
} from 'react-router-dom'
import { setFormDirty } from '../lib/unsavedChanges'
import { UnsavedNavigationGuard } from './UnsavedNavigationGuard'

const dirtyId = Symbol('navigation-test')

function Page({ name, to }: { name: string; to?: string }) {
  const navigate = useNavigate()
  return (
    <div>
      <h1>{name}</h1>
      {to && <button onClick={() => navigate(to)}>Go</button>}
    </div>
  )
}

function makeRouter(initialEntries: InitialEntry[], initialIndex?: number) {
  return createMemoryRouter(
    [
      {
        path: '/',
        element: <><UnsavedNavigationGuard /><Outlet /></>,
        children: [
          { path: 'a', element: <Page name="Page A" to="/b" /> },
          { path: 'b', element: <Page name="Page B" /> },
        ],
      },
    ],
    { initialEntries, initialIndex },
  )
}

afterEach(() => {
  setFormDirty(dirtyId, false)
  vi.restoreAllMocks()
})

describe('UnsavedNavigationGuard', () => {
  it('keeps an internal navigation blocked when discard is declined', async () => {
    setFormDirty(dirtyId, true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const router = makeRouter(['/a'])
    render(<RouterProvider router={router} />)

    fireEvent.click(screen.getByRole('button', { name: 'Go' }))

    await waitFor(() => expect(confirm).toHaveBeenCalledWith('Discard your unsaved changes?'))
    expect(router.state.location.pathname).toBe('/a')
  })

  it('covers browser/mobile Back and proceeds after confirmation', async () => {
    setFormDirty(dirtyId, true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const router = makeRouter(['/a', '/b'], 1)
    render(<RouterProvider router={router} />)

    await router.navigate(-1)

    await waitFor(() => expect(router.state.location.pathname).toBe('/a'))
    expect(confirm).toHaveBeenCalledWith('Discard your unsaved changes?')
  })

  it('does not obstruct same-document skip-link hashes', async () => {
    setFormDirty(dirtyId, true)
    const confirm = vi.spyOn(window, 'confirm')
    const router = makeRouter(['/b'])
    render(<RouterProvider router={router} />)

    await router.navigate('/b#main')

    expect(router.state.location.hash).toBe('#main')
    expect(confirm).not.toHaveBeenCalled()
  })
})
