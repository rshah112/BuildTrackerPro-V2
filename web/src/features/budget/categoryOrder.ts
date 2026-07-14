import type { BudgetCategory } from '../../domain/types'

type OrderedCategory = Pick<BudgetCategory, 'name' | 'sortOrder'>

export function compareCategories(a: OrderedCategory, b: OrderedCategory): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, undefined, { numeric: true })
}

export function nextCategorySortOrder(categories: OrderedCategory[]): number {
  return categories.reduce((highest, category) => Math.max(highest, category.sortOrder), -1) + 1
}
