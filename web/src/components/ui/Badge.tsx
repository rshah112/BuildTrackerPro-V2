import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warn' | 'danger' | 'info'

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
}) {
  return <span className={['badge', `badge-${tone}`, className].filter(Boolean).join(' ')}>{children}</span>
}
