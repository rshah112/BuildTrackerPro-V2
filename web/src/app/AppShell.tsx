import { useCallback } from 'react'
import { Outlet, Link } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { TabBar } from './TabBar'
import { PageTransition } from '../components/ui/PageTransition'
import { useToast } from '../components/ui/Toast'
import { usePullToRefresh } from '../lib/usePullToRefresh'

export function AppShell() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const refresh = useCallback(() => {
    queryClient.invalidateQueries()
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
          <Outlet />
        </PageTransition>
      </main>
      <TabBar />
    </div>
  )
}
