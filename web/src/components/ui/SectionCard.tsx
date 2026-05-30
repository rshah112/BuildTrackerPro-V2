import type { ReactNode } from 'react'

/** A titled content panel. Optional `trailing` sits on the title row (e.g. a total),
 *  `footnote` is a muted line under the body, and `tone="danger"` accents the panel
 *  for alerts (overdue, over-budget). Replaces the ad-hoc `.panel` + `.row-between`
 *  pattern repeated across screens. */
export function SectionCard({
  title,
  trailing,
  footnote,
  tone = 'default',
  children,
  className,
}: {
  title?: ReactNode
  trailing?: ReactNode
  footnote?: ReactNode
  tone?: 'default' | 'danger'
  children: ReactNode
  className?: string
}) {
  const cls = ['panel', tone === 'danger' && 'panel-danger', className].filter(Boolean).join(' ')
  return (
    <section className={cls}>
      {(title || trailing) && (
        <div className="panel-head">
          {title && <h2 className={tone === 'danger' ? 'danger-text' : undefined}>{title}</h2>}
          {trailing && <div className="panel-head-trailing">{trailing}</div>}
        </div>
      )}
      {children}
      {footnote && <p className="panel-foot">{footnote}</p>}
    </section>
  )
}
