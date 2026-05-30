import { Outlet, Link } from 'react-router-dom'
import { FolderKanban } from 'lucide-react'
import { TabBar } from './TabBar'

export function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="brand">HomeBuild&nbsp;Pro</span>
        <Link to="/projects" className="header-link">
          <FolderKanban size={16} aria-hidden />
          Projects
        </Link>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}
