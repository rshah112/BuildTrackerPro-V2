import { clampFraction } from './chartMath'

type DonutTone = 'brand' | 'success' | 'warn' | 'danger'

/** Ring gauge: the arc fills value/max, tinted by tone. Center shows label/sublabel. */
export function Donut({
  value,
  max,
  label,
  sublabel,
  tone = 'brand',
  size = 168,
}: {
  value: number
  max: number
  label: string
  sublabel?: string
  tone?: DonutTone
  size?: number
}) {
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const frac = clampFraction(value, max)
  const center = size / 2

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="donut"
      role="img"
      aria-label={`${label} ${sublabel ?? ''}`.trim()}
    >
      <circle cx={center} cy={center} r={r} fill="none" stroke="var(--color-surface-2)" strokeWidth={stroke} />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        className={`donut-arc donut-${tone}`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${frac * c} ${c}`}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x={center} y={center - 4} className="donut-label" textAnchor="middle">
        {label}
      </text>
      {sublabel && (
        <text x={center} y={center + 18} className="donut-sublabel" textAnchor="middle">
          {sublabel}
        </text>
      )}
    </svg>
  )
}
