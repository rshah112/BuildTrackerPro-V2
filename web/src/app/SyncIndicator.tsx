import { useEffect, useState } from 'react'
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react'
import {
  needsAttentionCount,
  needsAttentionMessage,
  pendingCount,
  retryNeedsAttention,
  subscribeOutbox,
} from '../lib/outbox'
import { isOnline } from '../lib/netStatus'
import { flushOutbox } from '../data/sync'

// Small status chip shown in the header when the user is offline or has unsynced changes queued
// in the outbox. Hidden entirely in the normal online + nothing-pending state.
export function SyncIndicator() {
  const [count, setCount] = useState(pendingCount())
  const [attention, setAttention] = useState(needsAttentionCount())
  const [online, setOnline] = useState(isOnline())
  const [retrying, setRetrying] = useState(false)

  useEffect(
    () =>
      subscribeOutbox(() => {
        setCount(pendingCount())
        setAttention(needsAttentionCount())
      }),
    [],
  )
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

  if (online && count === 0 && attention === 0) return null

  const plural = count === 1 ? '' : 's'
  const attentionPlural = attention === 1 ? '' : 's'
  const label = attention > 0
    ? `${attention} change${attentionPlural} need${attention === 1 ? 's' : ''} attention`
    : !online
    ? count > 0
      ? `Offline · ${count} change${plural} saved`
      : 'Offline'
    : `Syncing ${count}…`

  async function retry(): Promise<void> {
    if (retrying) return
    setRetrying(true)
    try {
      await retryNeedsAttention()
      await flushOutbox()
    } finally {
      setRetrying(false)
    }
  }

  return (
    <span
      className="sync-indicator"
      role="status"
      aria-live="polite"
      title={attention > 0 ? needsAttentionMessage() ?? undefined : undefined}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 600,
        padding: '3px 9px',
        borderRadius: 999,
        color:
          attention > 0
            ? 'var(--color-danger, #b91c1c)'
            : online
              ? 'var(--color-brand, #c2410c)'
              : 'var(--color-text-muted, #6b7280)',
        background: 'var(--color-surface-2, rgba(0,0,0,0.05))',
      }}
    >
      {attention > 0 ? (
        <AlertTriangle size={13} aria-hidden />
      ) : online ? (
        <RefreshCw size={13} aria-hidden />
      ) : (
        <CloudOff size={13} aria-hidden />
      )}
      <span>{label}</span>
      {online && (count > 0 || attention > 0) && (
        <button
          type="button"
          disabled={retrying}
          onClick={() => void (attention > 0 ? retry() : flushOutbox())}
          style={{
            background: 'none',
            border: 0,
            padding: 0,
            font: 'inherit',
            color: 'inherit',
            textDecoration: 'underline',
            cursor: retrying ? 'wait' : 'pointer',
          }}
        >
          {retrying ? 'Retrying…' : attention > 0 ? 'Retry' : 'Sync now'}
        </button>
      )}
    </span>
  )
}
