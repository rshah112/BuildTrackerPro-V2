import { Fragment, useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { ChevronDown } from 'lucide-react'
import { Field } from './Field'
import { matchesQuery } from '../../lib/search'

export interface ComboOption {
  /** The committed value. For a free (allowCustom) field this equals the label. */
  value: string
  label: string
  /** Secondary line shown under the label (e.g. a category, a phone number). */
  hint?: string
  /** Section header; consecutive options sharing a group render under one header. */
  group?: string
}

/** Searchable select / autocomplete. Two modes:
 *  - select (default): the user must pick an option; `value` is the option's id and the input
 *    shows its label. Type to filter.
 *  - free (`allowCustom`): the input text *is* the value (committed live); options are
 *    suggestions. Used for vendor / payment-method.
 *
 *  The dropdown expands in-flow (not absolutely positioned) so it never clips inside the
 *  scrolling Sheet and stays within its focus trap. Built on `Field` for label/aria wiring. */
export function Combobox({
  label,
  value,
  options,
  onChange,
  allowCustom = false,
  placeholder,
  hint,
  error,
  emptyText = 'No matches',
}: {
  label: string
  value: string
  options: ComboOption[]
  onChange: (value: string, option?: ComboOption) => void
  allowCustom?: boolean
  placeholder?: string
  hint?: string
  error?: string
  emptyText?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const optionRefs = useRef<(HTMLLIElement | null)[]>([])

  const selected = options.find((o) => o.value === value)
  const selectedLabel = allowCustom ? value : selected?.label ?? ''

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!open || !q) return options
    return options.filter((o) => matchesQuery(q, o.label, o.hint, o.group))
  }, [open, query, options])

  // Scroll the highlighted row into view. (`active` is kept in range by resetting to 0 on every
  // query change; any transient out-of-range index just no-ops via optional chaining.)
  useEffect(() => {
    if (open) optionRefs.current[active]?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const openList = () => {
    setQuery(allowCustom ? value : '')
    setActive(0)
    setOpen(true)
  }
  const choose = (o: ComboOption) => {
    onChange(o.value, o)
    setOpen(false)
  }
  // Close only when focus leaves the whole control (option clicks fire on mousedown, which
  // we preventDefault, so focus never leaves and this doesn't fire for them).
  const onBlur = (e: FocusEvent) => {
    if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) openList()
      else setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      // While open, Enter picks/closes and must NOT submit the form.
      if (open) {
        e.preventDefault()
        if (filtered[active]) choose(filtered[active])
        else setOpen(false)
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation() // close the dropdown, not the whole Sheet
        setOpen(false)
      }
    }
  }

  const inputText = open ? query : selectedLabel
  const activeId = open && filtered[active] ? `${listId}-opt-${active}` : undefined

  return (
    <Field label={label} hint={hint} error={error}>
      {(p) => (
        <div className="combobox" ref={wrapRef} onBlur={onBlur}>
          <div className="combobox-control">
            <input
              {...p}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeId}
              autoComplete="off"
              value={inputText}
              placeholder={placeholder}
              onFocus={openList}
              onClick={openList}
              onKeyDown={onKeyDown}
              onChange={(e) => {
                const t = e.target.value
                setQuery(t)
                setActive(0)
                if (!open) setOpen(true)
                if (allowCustom) onChange(t)
              }}
            />
            <ChevronDown className="combobox-chevron" size={18} aria-hidden />
          </div>
          {open && (
            <ul className="combobox-list" id={listId} role="listbox">
              {filtered.length === 0 ? (
                <li className="combobox-empty" role="presentation">
                  {allowCustom && query.trim() ? `Use “${query.trim()}”` : emptyText}
                </li>
              ) : (
                filtered.map((o, i) => {
                  const showGroup = o.group && o.group !== filtered[i - 1]?.group
                  const isActive = i === active
                  return (
                    <Fragment key={o.value || o.label}>
                      {showGroup && (
                        <li className="combobox-group" role="presentation">
                          {o.group}
                        </li>
                      )}
                      <li
                        id={`${listId}-opt-${i}`}
                        role="option"
                        aria-selected={isActive}
                        className={`combobox-option${isActive ? ' is-active' : ''}`}
                        ref={(el) => {
                          optionRefs.current[i] = el
                        }}
                        onMouseEnter={() => setActive(i)}
                        onMouseDown={(e) => {
                          e.preventDefault() // keep focus on the input; beat the blur
                          choose(o)
                        }}
                      >
                        <span className="combobox-option-label">{o.label}</span>
                        {o.hint && <span className="combobox-option-hint">{o.hint}</span>}
                      </li>
                    </Fragment>
                  )
                })
              )}
            </ul>
          )}
        </div>
      )}
    </Field>
  )
}
