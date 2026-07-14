// Tells "we couldn't reach the server because we're offline" apart from a real rejection
// (an RLS/constraint error, which supabase-js returns as { error } and the data layer rethrows
// explicitly). A genuine transport failure makes the underlying fetch REJECT, so it surfaces as
// a thrown TypeError ("Failed to fetch" / Safari's "Load failed") — that's what we queue on.

export function isOnline(): boolean {
  return typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine
}

export function isNetworkError(err: unknown): boolean {
  const candidate = err as { status?: unknown; statusCode?: unknown } | null
  const explicitStatus = candidate?.status ?? candidate?.statusCode
  if (explicitStatus !== undefined && explicitStatus !== null) {
    return isRetryableHttpStatus(explicitStatus)
  }
  if (!isOnline()) return true
  if (isRetryablePostgrestError(err)) return true
  if (err instanceof TypeError) {
    const m = err.message.toLowerCase()
    return m.includes('fetch') || m.includes('network') || m.includes('load failed')
  }
  const name = (err as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'FetchError' || name === 'NetworkError'
}

/** HTTP statuses that are transient for queued PostgREST writes. Status 0 is used
 * by fetch wrappers when no HTTP response was received. */
export function isRetryableHttpStatus(status: unknown): boolean {
  const value = typeof status === 'string' && status.trim() !== '' ? Number(status) : status
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (value === 0 || value === 408 || value === 429 || value >= 500)
  )
}

/** Supabase returns the HTTP status beside `error`, but mocks/wrappers sometimes attach
 * it to the error itself. Check both without treating validation/RLS failures as offline. */
export function isRetryablePostgrestError(error: unknown, responseStatus?: unknown): boolean {
  if (isRetryableHttpStatus(responseStatus)) return true
  const candidate = error as { status?: unknown; statusCode?: unknown } | null
  return isRetryableHttpStatus(candidate?.status) || isRetryableHttpStatus(candidate?.statusCode)
}

/** Subscribe to the browser coming back online. Returns an unsubscribe fn. */
export function onReconnect(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', cb)
  return () => window.removeEventListener('online', cb)
}
