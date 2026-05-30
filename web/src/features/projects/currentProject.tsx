import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useProjects } from './useProjects'

// The native app is multi-project (Portfolio + per-project views). The PWA mirrors
// that: a selected "current project" scopes the Dashboard/Budget/Photos tabs.

const KEY = 'btp.currentProjectId'

interface CurrentProject {
  projectId: string | null
  setProjectId: (id: string | null) => void
}

const Ctx = createContext<CurrentProject | null>(null)

export function CurrentProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setId] = useState<string | null>(() => localStorage.getItem(KEY))
  const setProjectId = useCallback((id: string | null) => {
    setId(id)
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  }, [])
  // Memoize so consumers (the whole authed app) don't re-render unless projectId changes.
  const value = useMemo(() => ({ projectId, setProjectId }), [projectId, setProjectId])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCurrentProject(): CurrentProject {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCurrentProject must be used within CurrentProjectProvider')
  return ctx
}

/** Gate for project-scoped screens. Single-project (the common case for one build)
 *  auto-selects so the app opens straight to the dashboard; with 0 or several
 *  projects it bounces to the portfolio to choose. */
export function RequireProject({ children }: { children: ReactNode }) {
  const { projectId, setProjectId } = useCurrentProject()
  const { data: projects = [], isLoading } = useProjects()
  const active = projects.filter((p) => !p.deletedAt)
  const valid = projectId != null && active.some((p) => p.id === projectId)

  useEffect(() => {
    if (isLoading) return
    if (projectId && !active.some((p) => p.id === projectId)) {
      // Stored id points at a trashed/deleted/foreign project — drop it so we
      // re-resolve (auto-select the only project, or bounce to the picker).
      setProjectId(null)
    } else if (!projectId && active.length === 1) {
      setProjectId(active[0].id)
    }
  }, [projectId, active, isLoading, setProjectId])

  if (valid) return <>{children}</>
  // Still loading, or about to auto-select/clear — show a spinner instead of a flash.
  if (isLoading || active.length === 1) return <div className="loading">Loading…</div>
  return <Navigate to="/projects" replace />
}
