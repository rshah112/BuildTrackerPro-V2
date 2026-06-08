// Tells "we couldn't reach the server because we're offline" apart from a real rejection
// (an RLS/constraint error, which supabase-js returns as { error } and the data layer rethrows
// explicitly). A genuine transport failure makes the underlying fetch REJECT, so it surfaces as
// a thrown TypeError ("Failed to fetch" / Safari's "Load failed") — that's what we queue on.

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine
}

export function isNetworkError(err: unknown): boolean {
  if (!isOnline()) return true
  if (err instanceof TypeError) {
    const m = err.message.toLowerCase()
    return m.includes('fetch') || m.includes('network') || m.includes('load failed')
  }
  const name = (err as { name?: string } | null)?.name
  return name === 'AbortError' || name === 'FetchError' || name === 'NetworkError'
}

/** Subscribe to the browser coming back online. Returns an unsubscribe fn. */
export function onReconnect(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('online', cb)
  return () => window.removeEventListener('online', cb)
}
