import { describe, expect, it } from 'vitest'
import { compareCategories, nextCategorySortOrder } from './categoryOrder'

describe('budget category order', () => {
  it('uses the explicit order before the category name', () => {
    const categories = [
      { name: 'Zoning', sortOrder: 0 },
      { name: 'Framing', sortOrder: 2 },
      { name: 'Design', sortOrder: 0 },
    ]

    expect([...categories].sort(compareCategories).map((category) => category.name)).toEqual([
      'Design',
      'Zoning',
      'Framing',
    ])
  })

  it('appends a new category after the highest existing order', () => {
    expect(nextCategorySortOrder([])).toBe(0)
    expect(nextCategorySortOrder([{ name: 'Design', sortOrder: 0 }, { name: 'Framing', sortOrder: 4 }])).toBe(5)
  })
})
