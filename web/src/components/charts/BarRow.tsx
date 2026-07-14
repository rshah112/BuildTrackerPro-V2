import { barWidthPct } from './chartMath'

type BarTone = 'brand' | 'success' | 'warn' | 'danger'

/** A labeled horizontal bar (e.g. one category's spend vs its budget). */
export function BarRow({
  label,
  value,
  max,
  valueText,
  tone = 'brand',
}: {
  label: string
  value: number
  max: number
  valueText: string
  tone?: BarTone
}) {
  return (
    <div className="barrow">
      <div className="barrow-head">
        <span className="barrow-label">{label}</span>
        <span className="barrow-value">{valueText}</span>
      </div>
      <div
        className="progress thin"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(max, value, 0)}
        aria-valuenow={Math.max(0, value)}
        aria-valuetext={valueText}
      >
        <span className={`fill-${tone}`} style={{ width: `${barWidthPct(value, max)}%` }} />
      </div>
    </div>
  )
}
