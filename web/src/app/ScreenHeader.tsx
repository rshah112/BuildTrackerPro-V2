import type { ReactNode } from 'react'

/** iOS large-title header for a screen. `trailing` sits on the title row (e.g. an
 *  add button); `subtitle` is an optional muted line under the title. */
export function ScreenHeader({
  title,
  subtitle,
  trailing,
}: {
  title: string
  subtitle?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <header className="screen-header">
      <div className="screen-header-row">
        <h1 className="screen-title">{title}</h1>
        {trailing && <div className="screen-header-actions">{trailing}</div>}
      </div>
      {subtitle && <p className="screen-subtitle">{subtitle}</p>}
    </header>
  )
}
