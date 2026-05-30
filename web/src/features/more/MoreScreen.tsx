import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, LogOut, Sun, Moon, SunMoon, Download } from 'lucide-react'
import { signOut } from '../auth/useSession'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { getStoredTheme, setTheme, type ThemePref } from '../../lib/theme'
import { useInstallPrompt } from '../../lib/useInstallPrompt'

export function MoreScreen() {
  const [theme, setThemeState] = useState<ThemePref>(getStoredTheme())
  const { canInstall, promptInstall } = useInstallPrompt()
  const choose = (t: ThemePref) => {
    setTheme(t)
    setThemeState(t)
  }

  return (
    <section>
      <ScreenHeader title="More" />

      <div className="list-group">
        <Link to="/projects" className="list-row">
          <FolderKanban className="list-row-icon" size={20} aria-hidden />
          <span className="list-row-label">Switch / manage projects</span>
          <span className="list-row-chevron" aria-hidden>›</span>
        </Link>
        {canInstall && (
          <button type="button" className="list-row" onClick={promptInstall}>
            <Download className="list-row-icon" size={20} aria-hidden />
            <span className="list-row-label">Install app</span>
            <span className="list-row-chevron" aria-hidden>›</span>
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

      <p className="muted" style={{ marginTop: '1.25rem' }}>
        Vendors, tasks, documents, bids, and exports arrive in later waves.
      </p>

      <Button variant="secondary" leadingIcon={<LogOut size={16} />} onClick={() => signOut()}>
        Sign out
      </Button>
    </section>
  )
}
