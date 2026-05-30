import { useRef, type ReactNode } from 'react'

export interface Segment<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

/** iOS-style single-select control. Implemented as an ARIA radiogroup with roving
 *  tabindex + arrow-key navigation (the correct pattern for a one-of-N choice). */
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
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const move = (from: number, delta: number) => {
    const next = (from + delta + segments.length) % segments.length
    onChange(segments[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {segments.map((s, i) => {
        const active = s.value === value
        return (
          <button
            key={s.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            className={`segment${active ? ' is-active' : ''}`}
            onClick={() => onChange(s.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault()
                move(i, 1)
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault()
                move(i, -1)
              }
            }}
          >
            {s.icon && <span className="segment-icon">{s.icon}</span>}
            {s.label}
          </button>
        )
      })}
    </div>
  )
}
