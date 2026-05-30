import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

/** Styled native <select> — keeps native picker UX (great on iOS) with a custom chevron. */
export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrap">
      <select className={['select', className].filter(Boolean).join(' ')} {...rest}>
        {children}
      </select>
      <ChevronDown className="select-chevron" size={18} aria-hidden />
    </div>
  )
}
