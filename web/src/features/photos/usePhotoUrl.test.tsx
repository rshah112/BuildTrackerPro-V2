// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const signed = vi.fn<(k: string) => Promise<string>>()
vi.mock('../../lib/r2', () => ({ signedDownloadUrl: (k: string) => signed(k) }))

import { usePhotoUrl } from './usePhotoUrl'

function makeWrapper() {
  const qc = new QueryClient()
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('usePhotoUrl', () => {
  beforeEach(() => signed.mockReset())

  it('does not sign when objectKey is null', () => {
    renderHook(() => usePhotoUrl(null), { wrapper: makeWrapper() })
    expect(signed).not.toHaveBeenCalled()
  })

  it('signs an object key and returns the URL', async () => {
    signed.mockResolvedValue('https://signed/photo')
    const { result } = renderHook(() => usePhotoUrl('k1'), { wrapper: makeWrapper() })
    await waitFor(() => expect(result.current.data).toBe('https://signed/photo'))
    expect(signed).toHaveBeenCalledWith('k1')
  })

  it('dedups: two hooks for the same key share one signed URL', async () => {
    signed.mockResolvedValue('https://signed/photo')
    const wrapper = makeWrapper()
    const a = renderHook(() => usePhotoUrl('same'), { wrapper })
    await waitFor(() => expect(a.result.current.data).toBe('https://signed/photo'))
    const b = renderHook(() => usePhotoUrl('same'), { wrapper })
    await waitFor(() => expect(b.result.current.data).toBe('https://signed/photo'))
    // Cached by key — only one network sign for both consumers.
    expect(signed).toHaveBeenCalledTimes(1)
  })
})
