import { useEffect, useState } from 'react'
import { CloudOff, RefreshCw } from 'lucide-react'
import { pendingCount, subscribeOutbox } from '../lib/outbox'
import { isOnline } from '../lib/netStatus'
import { flushOutbox } from '../data/sync'

// Small status chip shown in the header when the user is offline or has unsynced changes queued
// in the outbox. Hidden entirely in the normal online + nothing-pending state.
export function SyncIndicator() {
  const [count, setCount] = useState(pendingCount())
  const [online, setOnline] = useState(isOnline())

  useEffect(() => subscribeOutbox(() => setCount(pendingCount())), [])
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (online && count === 0) return null

  const plural = count === 1 ? '' : 's'
  const label = !online
    ? count > 0
      ? `Offline · ${count} change${plural} saved`
      : 'Offline'
    : `Syncing ${count}…`

  return (
    <span
      className="sync-indicator"
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: 999,
        color: online ? 'var(--color-brand, #c2410c)' : 'var(--color-text-muted, #6b7280)',
        background: 'var(--color-surface-2, rgba(0,0,0,0.05))',
      }}
    >
      {online ? <RefreshCw size={13} aria-hidden /> : <CloudOff size={13} aria-hidden />}
      <span>{label}</span>
      {online && count > 0 && (
        <button
          type="button"
          onClick={() => void flushOutbox()}
          style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textDecoration: 'underline', cursor: 'pointer' }}
        >
          Sync now
        </button>
      )}
    </span>
  )
}
