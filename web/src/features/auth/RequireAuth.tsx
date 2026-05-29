import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useSession } from './useSession'

/** Gate that redirects to /login when there's no active session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useSession()
  if (loading) return <div className="loading">Loading…</div>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}
