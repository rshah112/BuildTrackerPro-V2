import { NavLink, Outlet } from 'react-router-dom'

const tabs = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/budget', label: 'Budget', end: false },
  { to: '/photos', label: 'Photos', end: false },
  { to: '/more', label: 'More', end: false },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Outlet />
      </main>
      <nav className="tab-bar" aria-label="Primary">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
