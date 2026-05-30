import { useState } from 'react'
import { Field } from './Field'

const FMT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

// eslint-disable-next-line react-refresh/only-export-components
export function parseCurrency(raw: string): number {
  // Strip non-numeric, then keep only the first decimal point so "1.2.3" -> "1.23"
  // instead of NaN -> 0 (which would silently wipe the user's input).
  const cleaned = raw.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  const normalized =
    firstDot === -1
      ? cleaned
      : cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : 0
}

/** Currency input over a plain dollar `number`. Shows a `$` adornment and thousands
 *  separators when blurred; raw digits while editing (so typing/paste stays simple). */
export function CurrencyField({
  label,
  value,
  onChange,
  hint,
  error,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  hint?: string
  error?: string
}) {
  const [focused, setFocused] = useState(false)
  const display = focused ? (value === 0 ? '' : String(value)) : FMT.format(value || 0)

  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => (
        <div className="currency-input">
          <span className="currency-prefix" aria-hidden>
            $
          </span>
          <input
            {...p}
            type="text"
            inputMode="decimal"
            value={display}
            placeholder="0"
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onChange={(e) => onChange(parseCurrency(e.target.value))}
          />
        </div>
      )}
    </Field>
  )
}
