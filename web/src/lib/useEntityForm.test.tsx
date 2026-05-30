// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { FormEvent } from 'react'
import { renderHook, act } from '@testing-library/react'
import { useEntityForm } from './useEntityForm'

type Entity = { id: string; name: string }
type Draft = { name: string }
const noEvt = { preventDefault() {} } as unknown as FormEvent

describe('useEntityForm', () => {
  it('creates from the draft (no initial), then calls onSaved + onDone', async () => {
    const create = { mutateAsync: vi.fn(async (x: Draft) => ({ id: 'n1', ...x })), isPending: false }
    const update = { mutateAsync: vi.fn(), isPending: false }
    const onSaved = vi.fn()
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useEntityForm<Entity, Draft>({ blank: { name: '' }, create, update, onSaved, onDone }),
    )
    act(() => result.current.set('name', 'Acme'))
    await act(async () => {
      await result.current.submit(noEvt)
    })
    expect(create.mutateAsync).toHaveBeenCalledWith({ name: 'Acme' })
    expect(update.mutateAsync).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith({ id: 'n1', name: 'Acme' })
    expect(onDone).toHaveBeenCalled()
  })

  it('updates with { id, patch } when given an initial entity', async () => {
    const create = { mutateAsync: vi.fn(), isPending: false }
    const update = { mutateAsync: vi.fn(async (a: { id: string; patch: Draft }) => ({ id: a.id, ...a.patch })), isPending: false }
    const onDone = vi.fn()
    const { result } = renderHook(() =>
      useEntityForm<Entity, Draft>({ initial: { id: 'e1', name: 'Old' }, blank: { name: '' }, create, update, onDone }),
    )
    act(() => result.current.set('name', 'New'))
    await act(async () => {
      await result.current.submit(noEvt)
    })
    expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'e1', patch: { id: 'e1', name: 'New' } })
    expect(create.mutateAsync).not.toHaveBeenCalled()
  })

  it('applies transform to the payload before sending', async () => {
    const create = { mutateAsync: vi.fn(async (x: Draft) => ({ id: 'n', ...x })), isPending: false }
    const update = { mutateAsync: vi.fn(), isPending: false }
    const { result } = renderHook(() =>
      useEntityForm<Entity, Draft>({
        blank: { name: 'abc' },
        create,
        update,
        onDone: vi.fn(),
        transform: (d) => ({ name: d.name.toUpperCase() }),
      }),
    )
    await act(async () => {
      await result.current.submit(noEvt)
    })
    expect(create.mutateAsync).toHaveBeenCalledWith({ name: 'ABC' })
  })

  it('reflects pending state from either mutation in busy', () => {
    const { result } = renderHook(() =>
      useEntityForm<Entity, Draft>({
        blank: { name: '' },
        create: { mutateAsync: vi.fn(), isPending: true },
        update: { mutateAsync: vi.fn(), isPending: false },
        onDone: vi.fn(),
      }),
    )
    expect(result.current.busy).toBe(true)
  })
})
