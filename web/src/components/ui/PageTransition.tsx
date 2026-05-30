import type { ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

/** Re-runs a subtle enter animation each time the route changes. Keyed by pathname
 *  so the wrapper remounts on navigation. Respects prefers-reduced-motion via CSS. */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  )
}
