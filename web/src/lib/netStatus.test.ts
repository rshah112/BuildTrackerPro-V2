import { describe, expect, it } from 'vitest'
import { isNetworkError, isRetryableHttpStatus, isRetryablePostgrestError } from './netStatus'

describe('retryable PostgREST statuses', () => {
  it.each([0, '0', 408, '408', 429, 500, 503])('treats %s as transient', (status) => {
    expect(isRetryableHttpStatus(status)).toBe(true)
    expect(isRetryablePostgrestError(null, status)).toBe(true)
  })

  it.each([200, 201, 400, 401, 403, 404, 409, 422, null, undefined])(
    'does not retry permanent/success status %s',
    (status) => expect(isRetryableHttpStatus(status)).toBe(false),
  )

  it('recognizes status fields attached by wrappers', () => {
    expect(isRetryablePostgrestError({ status: 503 })).toBe(true)
    expect(isRetryablePostgrestError({ statusCode: '429' })).toBe(true)
    expect(isNetworkError({ name: 'PostgrestError', status: 500 })).toBe(true)
  })
})
