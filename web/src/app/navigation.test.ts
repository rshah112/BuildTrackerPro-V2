import {
  getMobileNavigation,
  getSidebarNavigation,
  mobileNavigationItemIsActive,
  navigationPathMatches,
} from './navigation'

describe('application navigation', () => {
  it('shows project destinations only when a project is active', () => {
    expect(getMobileNavigation(true).map((item) => item.id)).toEqual([
      'overview',
      'budget',
      'expenses',
      'photos',
      'more',
    ])
    expect(getSidebarNavigation(false).flatMap((group) => group.items).every((item) => !item.requiresProject)).toBe(true)
  })

  it('matches overview exactly and nested route paths by prefix', () => {
    const projectItems = getMobileNavigation(true)
    expect(navigationPathMatches(projectItems[0], '/')).toBe(true)
    expect(navigationPathMatches(projectItems[0], '/budget')).toBe(false)
    expect(navigationPathMatches(projectItems[1], '/budget/category')).toBe(true)
  })

  it('keeps More active for secondary mobile routes without competing with primary tabs', () => {
    const items = getMobileNavigation(true)
    const more = items.find((item) => item.id === 'more')!
    const photos = items.find((item) => item.id === 'photos')!

    expect(mobileNavigationItemIsActive(more, '/vendors', items)).toBe(true)
    expect(mobileNavigationItemIsActive(more, '/photos', items)).toBe(false)
    expect(mobileNavigationItemIsActive(photos, '/photos', items)).toBe(true)
  })
})
