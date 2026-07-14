import { describe, it, expect, vi, afterEach } from 'vitest'
import { objectKeyFor, keyBelongsToUser } from './objectKey'
import { deleteBlob, uploadBlob } from './r2'

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } }) },
  },
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('objectKey', () => {
  it('namespaces as userId/entity/id', () => {
    expect(objectKeyFor('u1', 'photo', 'abc')).toBe('u1/photo/abc')
  })
  it('ownership is a prefix check', () => {
    expect(keyBelongsToUser('u1/photo/abc', 'u1')).toBe(true)
    expect(keyBelongsToUser('u2/photo/abc', 'u1')).toBe(false)
  })
})

describe('uploadBlob', () => {
  it('remote path: requests a presigned URL, PUTs the blob, returns the server key', async () => {
    vi.stubEnv('VITE_R2_LOCAL', '')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://r2/put', key: 'u1/photo/xyz' }) })
      .mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    const res = await uploadBlob(new Blob(['x'], { type: 'image/jpeg' }), 'photo')

    expect(res).toEqual({ key: 'u1/photo/xyz' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/r2-sign')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      op: 'put',
      entity: 'photo',
      contentLength: 1,
    })
    expect(fetchMock.mock.calls[1][0]).toBe('https://r2/put')
    expect(fetchMock.mock.calls[1][1].method).toBe('PUT')
  })

  it('local stub path: returns a local/ key and makes no network call', async () => {
    vi.stubEnv('VITE_R2_LOCAL', '1')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const res = await uploadBlob(new Blob(['x']), 'photo')

    expect(res.key.startsWith('local/photo/')).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects empty and oversized files before requesting a signed URL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(uploadBlob(new Blob([]), 'photo')).rejects.toThrow(/empty/)
    await expect(
      uploadBlob({ size: 50 * 1024 * 1024 + 1, type: 'application/octet-stream' } as Blob, 'photo'),
    ).rejects.toThrow(/50 MB/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('requests an authenticated permanent object deletion', async () => {
    vi.stubEnv('VITE_R2_LOCAL', '')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
    await deleteBlob('u1/backup/abc')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ op: 'delete', key: 'u1/backup/abc' })
  })
})
