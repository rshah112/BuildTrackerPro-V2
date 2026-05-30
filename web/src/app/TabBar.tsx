import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Wallet, Receipt, Image, MoreHorizontal, type LucideIcon } from 'lucide-react'

const tabs: { to: string; label: string; icon: LucideIcon; end: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/budget', label: 'Budget', icon: Wallet, end: false },
  { to: '/expenses', label: 'Expenses', icon: Receipt, end: false },
  { to: '/photos', label: 'Photos', icon: Image, end: false },
  { to: '/more', label: 'More', icon: MoreHorizontal, end: false },
]

export function TabBar() {
  return (
    <nav className="tab-bar" aria-label="Primary">
      {tabs.map(({ to, label, icon: Glyph, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => (isActive ? 'tab active' : 'tab')}
        >
          <Glyph className="tab-icon" size={23} aria-hidden />
          <span className="tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
