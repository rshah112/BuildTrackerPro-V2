// Stale lazy-chunk recovery. After a deploy replaces a hashed asset, a still-open client
// that tries to import the old chunk throws one of these. With no handling the app blanks;
// we reload ONCE per session to pull the fresh shell, guarded against a reload loop.

const CHUNK_RE =
  /(Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|ChunkLoadError|Unable to preload|Loading chunk|'text\/html' is not a valid JavaScript)/i

export function isChunkError(err: unknown): boolean {
  const e = err as { message?: string; name?: string } | null
  return e?.name === 'ChunkLoadError' || CHUNK_RE.test(e?.message || String(err))
}

const RELOAD_KEY = 'btp.chunkReloaded'

/** Reload once per session on a stale-chunk error. Returns true if a reload was triggered. */
export function reloadOnceForChunk(): boolean {
  try {
    if (sessionStorage.getItem(RELOAD_KEY)) return false
    sessionStorage.setItem(RELOAD_KEY, '1')
  } catch {
    /* storage unavailable — still reload (worst case one extra reload) */
  }
  window.location.reload()
  return true
}

/** Clear the loop guard (used by the manual "Reload app" action). */
export function clearChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(RELOAD_KEY)
  } catch {
    /* ignore */
  }
}
