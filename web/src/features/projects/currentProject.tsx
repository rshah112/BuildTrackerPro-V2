import { createContext, useContext, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

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
  const setProjectId = (id: string | null) => {
    setId(id)
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  }
  return <Ctx.Provider value={{ projectId, setProjectId }}>{children}</Ctx.Provider>
}

export function useCurrentProject(): CurrentProject {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCurrentProject must be used within CurrentProjectProvider')
  return ctx
}

/** Gate for project-scoped screens: bounce to the portfolio when nothing is selected. */
export function RequireProject({ children }: { children: ReactNode }) {
  const { projectId } = useCurrentProject()
  if (!projectId) return <Navigate to="/projects" replace />
  return <>{children}</>
}
