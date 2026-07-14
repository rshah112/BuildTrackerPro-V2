// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { hasUnsavedChanges } from './unsavedChanges'
import { useDirtyState } from './useDirtyState'

describe('useDirtyState', () => {
  it('guards changed state and clears after save/reset', () => {
    const { result, unmount } = renderHook(() => useDirtyState({ name: '' }))
    act(() => result.current.setValue({ name: 'Kitchen' }))
    expect(result.current.dirty).toBe(true)
    expect(hasUnsavedChanges()).toBe(true)
    act(() => result.current.markClean())
    expect(hasUnsavedChanges()).toBe(false)
    act(() => result.current.resetClean({ name: 'Server value' }))
    expect(result.current.value.name).toBe('Server value')
    expect(result.current.dirty).toBe(false)
    unmount()
  })
})
