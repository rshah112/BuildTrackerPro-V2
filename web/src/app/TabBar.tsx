import { Link, useLocation } from 'react-router-dom'
import { getMobileNavigation, mobileNavigationItemIsActive } from './navigation'

export function TabBar({ hasProject }: { hasProject: boolean }) {
  const { pathname } = useLocation()
  const tabs = getMobileNavigation(hasProject)

  return (
    <nav className="tab-bar" aria-label="Primary">
      {tabs.map((item) => {
        const Glyph = item.icon
        const active = mobileNavigationItemIsActive(item, pathname, tabs)
        return (
          <Link
            key={item.id}
            to={item.to}
            viewTransition
            className={active ? 'tab active' : 'tab'}
            aria-current={active ? 'page' : undefined}
          >
            <Glyph className="tab-icon" size={22} aria-hidden />
            <span className="tab-label">{item.mobileLabel ?? item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
