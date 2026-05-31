import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  FolderKanban,
  LogOut,
  Sun,
  Moon,
  SunMoon,
  Download,
  Contact,
  FileEdit,
  Sparkles,
  ListTodo,
  FileStack,
  CalendarClock,
  FileDown,
  FolderOpen,
  Info,
  Grid2x2,
  Receipt,
  Trash2,
  Landmark,
  Activity,
  PieChart,
  type LucideIcon,
} from 'lucide-react'
import { signOut } from '../auth/useSession'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { getStoredTheme, setTheme, type ThemePref } from '../../lib/theme'
import { useInstallPrompt } from '../../lib/useInstallPrompt'
import { useCurrentProject } from '../projects/currentProject'

const PROJECT_LINKS: { to: string; label: string; icon: LucideIcon }[] = [
  { to: '/project-info', label: 'Project info', icon: Info },
  { to: '/phases', label: 'Build phases', icon: Activity },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/vendors', label: 'Vendors', icon: Contact },
  { to: '/change-orders', label: 'Change orders', icon: FileEdit },
  { to: '/allowances', label: 'Allowances', icon: Sparkles },
  { to: '/loan', label: 'Construction loan', icon: Landmark },
  { to: '/bids', label: 'Bids', icon: FileStack },
  { to: '/documents', label: 'Documents', icon: FolderOpen },
  { to: '/receipts', label: 'Receipts', icon: Receipt },
  { to: '/rooms', label: 'By room', icon: Grid2x2 },
  { to: '/cashflow', label: 'Cash flow', icon: CalendarClock },
  { to: '/export', label: 'Export & backup', icon: FileDown },
  { to: '/trash', label: 'Trash', icon: Trash2 },
]

export function MoreScreen() {
  const [theme, setThemeState] = useState<ThemePref>(getStoredTheme())
  const { canInstall, promptInstall } = useInstallPrompt()
  const { projectId } = useCurrentProject()
  const choose = (t: ThemePref) => {
    setTheme(t)
    setThemeState(t)
  }

  return (
    <section>
      <ScreenHeader title="More" />

      {projectId && (
        <>
          <h2 className="section-label">This project</h2>
          <div className="list-group">
            {PROJECT_LINKS.map(({ to, label, icon: Glyph }) => (
              <Link key={to} to={to} className="list-row">
                <Glyph className="list-row-icon" size={20} aria-hidden />
                <span className="list-row-label">{label}</span>
                <span className="list-row-chevron" aria-hidden>
                  ›
                </span>
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="section-label">App</h2>
      <div className="list-group">
        <Link to="/portfolio" className="list-row">
          <PieChart className="list-row-icon" size={20} aria-hidden />
          <span className="list-row-label">Portfolio insights</span>
          <span className="list-row-chevron" aria-hidden>
            ›
          </span>
        </Link>
        <Link to="/projects" className="list-row">
          <FolderKanban className="list-row-icon" size={20} aria-hidden />
          <span className="list-row-label">Switch / manage projects</span>
          <span className="list-row-chevron" aria-hidden>
            ›
          </span>
        </Link>
        {canInstall && (
          <button type="button" className="list-row" onClick={promptInstall}>
            <Download className="list-row-icon" size={20} aria-hidden />
            <span className="list-row-label">Install app</span>
            <span className="list-row-chevron" aria-hidden>
              ›
            </span>
          </button>
        )}
      </div>

      <h2 className="section-label">Appearance</h2>
      <SegmentedControl
        ariaLabel="Appearance"
        value={theme}
        onChange={choose}
        segments={[
          { value: 'light', label: 'Light', icon: <Sun size={15} /> },
          { value: 'dark', label: 'Dark', icon: <Moon size={15} /> },
          { value: 'system', label: 'System', icon: <SunMoon size={15} /> },
        ]}
      />

      <div style={{ marginTop: '1.5rem' }}>
        <Button variant="secondary" leadingIcon={<LogOut size={16} />} onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </section>
  )
}
