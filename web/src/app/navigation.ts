import {
  Activity,
  Calculator,
  CalendarClock,
  Contact,
  FileDown,
  FileEdit,
  FileStack,
  FolderKanban,
  FolderOpen,
  Grid2x2,
  Image as ImageIcon,
  Info,
  Landmark,
  LayoutDashboard,
  ListTodo,
  MoreHorizontal,
  PieChart,
  Receipt,
  ScrollText,
  Settings,
  Sparkles,
  Trash2,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

export interface NavigationItem {
  id: string
  to: string
  label: string
  mobileLabel?: string
  icon: LucideIcon
  requiresProject?: boolean
  /** Exact matching is important for `/`, which would otherwise match every route. */
  end?: boolean
}

export interface NavigationGroup {
  id: string
  label: string
  items: NavigationItem[]
}

const overview: NavigationItem = {
  id: 'overview',
  to: '/',
  label: 'Overview',
  mobileLabel: 'Overview',
  icon: LayoutDashboard,
  requiresProject: true,
  end: true,
}

const budget: NavigationItem = {
  id: 'budget',
  to: '/budget',
  label: 'Budget',
  icon: Wallet,
  requiresProject: true,
}

const expenses: NavigationItem = {
  id: 'expenses',
  to: '/expenses',
  label: 'Expenses',
  icon: Receipt,
  requiresProject: true,
}

const photos: NavigationItem = {
  id: 'photos',
  to: '/photos',
  label: 'Photos',
  icon: ImageIcon,
  requiresProject: true,
}

const projects: NavigationItem = {
  id: 'projects',
  to: '/projects',
  label: 'Projects',
  icon: FolderKanban,
}

const portfolio: NavigationItem = {
  id: 'portfolio',
  to: '/portfolio',
  label: 'Portfolio',
  icon: PieChart,
}

const recovery: NavigationItem = {
  id: 'recovery',
  to: '/export',
  label: 'Recovery center',
  mobileLabel: 'Recovery',
  icon: FileDown,
}

const more: NavigationItem = {
  id: 'more',
  to: '/more',
  label: 'Settings & more',
  mobileLabel: 'More',
  icon: MoreHorizontal,
}

/**
 * One route map powers the expanded desktop sidebar, the tablet rail, and the
 * mobile bottom navigation. Keep route labels and icons here rather than in the
 * individual navigation surfaces.
 */
export const NAVIGATION_GROUPS: NavigationGroup[] = [
  {
    id: 'financial',
    label: 'Financial',
    items: [
      overview,
      budget,
      expenses,
      { id: 'cashflow', to: '/cashflow', label: 'Cash flow', icon: CalendarClock, requiresProject: true },
      { id: 'change-orders', to: '/change-orders', label: 'Change orders', icon: FileEdit, requiresProject: true },
      { id: 'allowances', to: '/allowances', label: 'Allowances', icon: Sparkles, requiresProject: true },
      { id: 'loan', to: '/loan', label: 'Construction loan', icon: Landmark, requiresProject: true },
    ],
  },
  {
    id: 'project',
    label: 'Project',
    items: [
      { id: 'project-info', to: '/project-info', label: 'Project details', icon: Info, requiresProject: true },
      { id: 'phases', to: '/phases', label: 'Build phases', icon: Activity, requiresProject: true },
      { id: 'tasks', to: '/tasks', label: 'Tasks', icon: ListTodo, requiresProject: true },
      { id: 'rooms', to: '/rooms', label: 'Spaces & rooms', icon: Grid2x2, requiresProject: true },
      photos,
      { id: 'vendors', to: '/vendors', label: 'Vendors', icon: Contact, requiresProject: true },
      { id: 'bids', to: '/bids', label: 'Bids', icon: FileStack, requiresProject: true },
      { id: 'lien-waivers', to: '/lien-waivers', label: 'Lien waivers', icon: ScrollText, requiresProject: true },
      { id: 'documents', to: '/documents', label: 'Documents', icon: FolderOpen, requiresProject: true },
      { id: 'receipts', to: '/receipts', label: 'Receipts', icon: Receipt, requiresProject: true },
    ],
  },
  {
    id: 'reports',
    label: 'Reports & data',
    items: [
      { id: 'tax-1099', to: '/tax-1099', label: 'Tax / 1099 prep', icon: Calculator, requiresProject: true },
      portfolio,
      recovery,
    ],
  },
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      projects,
      { id: 'notification-settings', to: '/notification-settings', label: 'Reminder settings', icon: Settings },
      { id: 'trash', to: '/trash', label: 'Recently deleted', icon: Trash2, requiresProject: true },
      more,
    ],
  },
]

const projectMobileIds = ['overview', 'budget', 'expenses', 'photos', 'more']
const noProjectMobileIds = ['projects', 'portfolio', 'recovery', 'more']

const allItems = NAVIGATION_GROUPS.flatMap((group) => group.items)
const itemsById = new Map(allItems.map((item) => [item.id, item]))

export function getSidebarNavigation(hasProject: boolean): NavigationGroup[] {
  return NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => hasProject || !item.requiresProject),
  })).filter((group) => group.items.length > 0)
}

export function getMobileNavigation(hasProject: boolean): NavigationItem[] {
  return (hasProject ? projectMobileIds : noProjectMobileIds)
    .map((id) => itemsById.get(id))
    .filter((item): item is NavigationItem => Boolean(item))
}

export function navigationPathMatches(item: NavigationItem, pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, '') || '/'
  if (item.end) return normalized === item.to
  return normalized === item.to || normalized.startsWith(`${item.to}/`)
}

/** Mobile's More item represents every route that is not one of the visible
 * bottom-navigation destinations, so secondary screens always retain a clear
 * active location. */
export function mobileNavigationItemIsActive(
  item: NavigationItem,
  pathname: string,
  mobileItems: NavigationItem[],
): boolean {
  if (item.id !== 'more') return navigationPathMatches(item, pathname)
  if (navigationPathMatches(item, pathname)) return true
  return !mobileItems.some(
    (candidate) => candidate.id !== 'more' && navigationPathMatches(candidate, pathname),
  )
}
