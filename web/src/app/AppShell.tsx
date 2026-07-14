import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { Building2, ChevronsUpDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabBar } from './TabBar'
import { Sidebar } from './Sidebar'
import { PageTransition } from '../components/ui/PageTransition'
import { ListSkeleton } from '../components/ui/Feedback'
import { useToast } from '../components/ui/Toast'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { useCurrentProject } from '../features/projects/currentProject'
import { maybeAutoBackup } from '../features/export/cloudBackup'
import { NotifyPrompt } from '../features/notifications/NotifyPrompt'
import { DueReminders } from '../features/notifications/DueReminders'
import { notifState, type NotifState } from '../lib/notifications'
import { ErrorBoundary } from './ErrorBoundary'
import { SyncIndicator } from './SyncIndicator'
import { useProjects } from '../features/projects/useProjects'
import { UnsavedNavigationGuard } from './UnsavedNavigationGuard'

const SIDEBAR_PREF = 'btp.sidebarCollapsed'

function storedSidebarPreference(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_PREF) === 'true'
  } catch {
    return false
  }
}

export function AppShell() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { projectId } = useCurrentProject()
  const { data: projects = [] } = useProjects()
  const currentProject = projects.find((project) => project.id === projectId)
  const { pathname } = useLocation()
  const [perm, setPerm] = useState<NotifState>(notifState())
  const [sidebarCollapsed, setSidebarCollapsed] = useState(storedSidebarPreference)
  // Each route is a new work context. Reset both axes so a scrolled financial
  // table never drops the user into the middle of the next screen.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 })
  }, [pathname])
  // Daily off-site safety snapshot to R2 (best-effort, non-blocking).
  useEffect(() => {
    if (projectId) void maybeAutoBackup(projectId)
  }, [projectId])
  const refresh = useCallback(() => {
    // Mark everything stale but only refetch what's currently mounted (the visible
    // screen); off-screen tabs refetch lazily on next visit instead of all at once.
    queryClient.invalidateQueries({ refetchType: 'active' })
    toast.show('Refreshed')
  }, [queryClient, toast])
  usePullToRefresh(refresh)

  const toggleSidebar = () => {
    setSidebarCollapsed((wasCollapsed) => {
      const next = !wasCollapsed
      try {
        localStorage.setItem(SIDEBAR_PREF, String(next))
      } catch {
        // Storage can be unavailable in private browsing; the in-memory state still works.
      }
      return next
    })
  }

  return (
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}`}>
      <UnsavedNavigationGuard />
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar hasProject={Boolean(projectId)} collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <header className="app-header">
        <div className="app-header-top">
          <Link to="/" className="brand-lockup app-header-brand" aria-label="HomeBuild Pro dashboard">
            <span className="brand-mark" aria-hidden>HB</span>
            <span className="brand">HomeBuild&nbsp;Pro</span>
          </Link>
          {currentProject && (
            <Link to="/projects" className="project-context" aria-label={`Switch project. Current project: ${currentProject.name}`}>
              <span className="project-context-icon"><Building2 size={17} aria-hidden /></span>
              <span className="project-context-copy">
                <small>Current project</small>
                <strong>{currentProject.name}</strong>
              </span>
              <ChevronsUpDown size={16} aria-hidden />
            </Link>
          )}
          <span className="app-header-actions">
            <SyncIndicator />
          </span>
        </div>
      </header>
      <main className="app-main" id="main">
        <PageTransition>
          {/* Keyed by route so a crash on one screen clears when you navigate away, and a
              stale lazy-chunk error auto-reloads instead of blanking the whole app. */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<ListSkeleton />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </PageTransition>
      </main>
      {projectId && perm === 'granted' && <DueReminders projectId={projectId} />}
      <NotifyPrompt onChange={setPerm} />
      <TabBar hasProject={Boolean(projectId)} />
    </div>
  )
}
