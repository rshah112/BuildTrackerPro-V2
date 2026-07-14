import { sparklinePoints } from './chartMath'

/** Cumulative/trend area line. Values map to a width×height viewBox. */
export function Sparkline({
  values,
  width = 320,
  height = 72,
  ariaLabel,
}: {
  values: number[]
  width?: number
  height?: number
  ariaLabel?: string
}) {
  const pad = 3
  const pts = sparklinePoints(values, width, height, pad)
  if (pts.length < 2) return <div className="sparkline-empty muted">Not enough data yet</div>

  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="sparkline"
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `Trend across ${values.length} recorded values`}
    >
      <polygon className="sparkline-area" points={area} />
      <polyline className="sparkline-line" points={line} fill="none" />
    </svg>
  )
}
