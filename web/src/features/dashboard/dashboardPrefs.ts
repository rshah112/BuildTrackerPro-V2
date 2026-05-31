import { useState } from 'react'

// Persisted show/hide preferences for dashboard sections (native "Customize Dashboard").
export interface DashboardPrefs {
  metrics: boolean
  eac: boolean
  phases: boolean
  category: boolean
  trend: boolean
  attention: boolean
  upcoming: boolean
  recentExpenses: boolean
  recentPhotos: boolean
}

const DEFAULTS: DashboardPrefs = {
  metrics: true,
  eac: true,
  phases: true,
  category: true,
  trend: true,
  attention: true,
  upcoming: true,
  recentExpenses: true,
  recentPhotos: true,
}
const KEY = 'btp.dashboardPrefs'

export const DASHBOARD_SECTIONS: { key: keyof DashboardPrefs; label: string }[] = [
  { key: 'metrics', label: 'Key metrics' },
  { key: 'eac', label: 'Estimated final cost' },
  { key: 'phases', label: 'Phase Pulse' },
  { key: 'category', label: 'Spend by category' },
  { key: 'trend', label: 'Spend over time' },
  { key: 'upcoming', label: 'Upcoming payments' },
  { key: 'attention', label: 'Attention' },
  { key: 'recentExpenses', label: 'Recent expenses' },
  { key: 'recentPhotos', label: 'Recent photos' },
]

function load(): DashboardPrefs {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<DashboardPrefs>) }
  } catch {
    return DEFAULTS
  }
}

export function useDashboardPrefs() {
  const [prefs, setPrefs] = useState<DashboardPrefs>(load)
  const toggle = (k: keyof DashboardPrefs) =>
    setPrefs((p) => {
      const next = { ...p, [k]: !p[k] }
      try {
        localStorage.setItem(KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  return { prefs, toggle }
}
