import type { ReactNode } from 'react'

/** A single KPI tile: label, large figure, and an optional sub-line / trend.
 *  Renders the established `.metric-card` markup so existing grid styling applies;
 *  `tone="danger"` flags an over-budget figure, `delta` slots a trend indicator. */
export function Stat({
  label,
  value,
  sub,
  delta,
  tone = 'default',
}: {
  label: ReactNode
  value: ReactNode
  sub?: ReactNode
  delta?: ReactNode
  tone?: 'default' | 'danger'
}) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong className={tone === 'danger' ? 'danger-text' : undefined}>{value}</strong>
      {(sub || delta) && (
        <small className="stat-sub">
          {delta}
          {sub}
        </small>
      )}
    </div>
  )
}

/** Directional change indicator (e.g. "▲ $1,200 this week"). Tone-neutral by default
 *  so a rising figure doesn't imply alarm; pass `tone` to color it semantically. */
export function TrendDelta({
  value,
  label,
  format,
  tone = 'neutral',
}: {
  value: number
  label?: string
  format: (n: number) => string
  tone?: 'neutral' | 'up-good' | 'up-bad'
}) {
  if (value === 0) return null
  const up = value > 0
  const cls =
    tone === 'neutral'
      ? 'trend'
      : (tone === 'up-good') === up
        ? 'trend trend-pos'
        : 'trend trend-neg'
  return (
    <span className={cls}>
      <span aria-hidden>{up ? '▲' : '▼'}</span>
      <span className="sr-only">{up ? 'up ' : 'down '}</span> {format(Math.abs(value))}
      {label && <span className="trend-label"> {label}</span>}
    </span>
  )
}
