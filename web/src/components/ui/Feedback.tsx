import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Loader2 } from 'lucide-react'

/** Centered empty/zero state with optional call to action. */
export function EmptyState({
  icon: Glyph,
  title,
  body,
  action,
}: {
  icon?: LucideIcon
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {Glyph && (
        <div className="empty-icon" aria-hidden>
          <Glyph size={28} />
        </div>
      )}
      <h3 className="empty-title">{title}</h3>
      {body && <p className="empty-body">{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

/** Shimmer placeholder. Size it with width/height or className. */
export function Skeleton({
  width,
  height = '1rem',
  radius,
  className,
}: {
  width?: string | number
  height?: string | number
  radius?: string
  className?: string
}) {
  return (
    <span
      className={['skeleton', className].filter(Boolean).join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden
    />
  )
}

/** Loading placeholder for a list/card screen: shimmer rows on the card-list rhythm.
 *  Announces "Loading…" to screen readers via an aria-live region. */
export function ListSkeleton({ rows = 4, height = '64px' }: { rows?: number; height?: string }) {
  return (
    <div className="card-list" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} height={height} radius="var(--radius-lg)" />
      ))}
    </div>
  )
}

export function Spinner({ size = 20, label }: { size?: number; label?: string }) {
  return (
    <span className="spinner" role={label ? 'status' : undefined} aria-label={label}>
      <Loader2 size={size} className="spinner-glyph" aria-hidden />
    </span>
  )
}
