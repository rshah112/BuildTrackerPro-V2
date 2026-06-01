import { Suspense, useCallback, useEffect, useState } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabBar } from './TabBar'
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

export function AppShell() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const { projectId } = useCurrentProject()
  const { pathname } = useLocation()
  const [perm, setPerm] = useState<NotifState>(notifState())

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

  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="app-header">
        <span className="brand">HomeBuild&nbsp;Pro</span>
        <Link to="/projects" className="header-link">
          <FolderKanban size={16} aria-hidden />
          Projects
        </Link>
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
      <TabBar />
    </div>
  )
}
