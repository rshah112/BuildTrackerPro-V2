import type { ReactNode } from 'react'
import '../../styles/workbench.css'

export interface SummaryMetric {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  tone?: 'default' | 'success' | 'warn' | 'danger'
}

/** A compact, grouped KPI surface for financial screens. */
export function SummaryStrip({
  label,
  metrics,
}: {
  label: string
  metrics: SummaryMetric[]
}) {
  return (
    <section className="summary-strip" aria-label={label}>
      {metrics.map((metric, index) => (
        <div className="summary-metric" key={index}>
          <span className="summary-label">{metric.label}</span>
          <strong className={`summary-value summary-${metric.tone ?? 'default'}`}>
            {metric.value}
          </strong>
          {metric.detail && <span className="summary-detail">{metric.detail}</span>}
        </div>
      ))}
    </section>
  )
}
