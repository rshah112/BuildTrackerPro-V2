// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PortfolioScreen } from './PortfolioScreen'

type QueryState = { data: unknown[]; isLoading: boolean; error: Error | null }

const { state } = vi.hoisted(() => ({
  state: {
    projects: { data: [], isLoading: false, error: null } as QueryState,
    rows: {} as Record<string, QueryState>,
  },
}))

vi.mock('../projects/useProjects', () => ({
  useProjects: () => state.projects,
}))

vi.mock('../../data/hooks', () => ({
  useRows: (name: string) => state.rows[name],
}))

vi.mock('../projects/currentProject', () => ({
  useCurrentProject: () => ({ projectId: null, setProjectId: vi.fn() }),
}))

const ready = (data: unknown[] = []): QueryState => ({ data, isLoading: false, error: null })

describe('PortfolioScreen query states', () => {
  beforeEach(() => {
    state.projects = ready([
      {
        id: 'project-1',
        name: 'House',
        constructionBudget: 500_000,
        contingencyBudget: 50_000,
      },
    ])
    state.rows = {
      budget_line_items: ready(),
      expenses: ready(),
      change_orders: ready(),
      allowance_selections: ready(),
    }
  })

  it('keeps the header visible and withholds totals while a financial dependency loads', () => {
    state.rows.expenses = { data: [], isLoading: true, error: null }

    render(
      <MemoryRouter>
        <PortfolioScreen />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('All projects')).not.toBeInTheDocument()
  })

  it('shows a dependency error instead of zero-value portfolio totals', () => {
    state.rows.expenses = { data: [], isLoading: false, error: new Error('expenses unavailable') }

    render(
      <MemoryRouter>
        <PortfolioScreen />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t load portfolio totals: expenses unavailable',
    )
    expect(screen.queryByText('All projects')).not.toBeInTheDocument()
  })
})
