import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  getMobileNavigation,
  getSidebarNavigation,
  mobileNavigationItemIsActive,
  navigationPathMatches,
} from './navigation'

export function Sidebar({
  hasProject,
  collapsed,
  onToggle,
}: {
  hasProject: boolean
  collapsed: boolean
  onToggle: () => void
}) {
  const { pathname } = useLocation()
  const groups = getSidebarNavigation(hasProject)
  const railItems = getMobileNavigation(hasProject)

  return (
    <aside className="app-sidebar" aria-label="Application navigation">
      <Link to="/" className="sidebar-brand" aria-label="HomeBuild Pro overview" viewTransition>
        <span className="brand-mark" aria-hidden>
          HB
        </span>
        <span className="sidebar-brand-name">HomeBuild Pro</span>
      </Link>

      <nav className="sidebar-nav sidebar-nav-full" aria-label="Primary">
        {groups.map((group) => (
          <section className="sidebar-group" key={group.id} aria-labelledby={`sidebar-${group.id}`}>
            <h2 className="sidebar-group-label" id={`sidebar-${group.id}`}>
              {group.label}
            </h2>
            <div className="sidebar-group-items">
              {group.items.map((item) => {
                const active = navigationPathMatches(item, pathname)
                const Glyph = item.icon
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    viewTransition
                    className={`sidebar-link${active ? ' is-active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <Glyph className="sidebar-link-icon" size={19} aria-hidden />
                    <span className="sidebar-label">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </nav>

      <nav className="sidebar-nav sidebar-nav-rail" aria-label="Primary">
        {railItems.map((item) => {
          const active = mobileNavigationItemIsActive(item, pathname, railItems)
          const Glyph = item.icon
          return (
            <Link
              key={item.id}
              to={item.to}
              viewTransition
              className={`sidebar-link${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={item.mobileLabel ?? item.label}
              title={item.mobileLabel ?? item.label}
            >
              <Glyph className="sidebar-link-icon" size={20} aria-hidden />
              <span className="sidebar-label">{item.mobileLabel ?? item.label}</span>
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        className="sidebar-collapse"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight size={18} aria-hidden /> : <ChevronLeft size={18} aria-hidden />}
        <span className="sidebar-label">Collapse</span>
      </button>
    </aside>
  )
}
