import type { ReactNode } from 'react'

export interface Segment<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

/** iOS-style segmented control. Renders as a tablist for accessibility. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  segments,
  ariaLabel,
}: {
  value: T
  onChange: (value: T) => void
  segments: Segment<T>[]
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="tablist" aria-label={ariaLabel}>
      {segments.map((s) => {
        const active = s.value === value
        return (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={`segment${active ? ' is-active' : ''}`}
            onClick={() => onChange(s.value)}
          >
            {s.icon && <span className="segment-icon">{s.icon}</span>}
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
