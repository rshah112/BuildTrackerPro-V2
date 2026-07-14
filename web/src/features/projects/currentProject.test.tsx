// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CurrentProjectProvider, RequireProject } from './currentProject'

const { projectQuery } = vi.hoisted(() => ({
  projectQuery: {
    data: [] as Array<{ id: string; deletedAt: string | null }>,
    isLoading: false,
    isFetching: false,
  },
}))

vi.mock('./useProjects', () => ({
  useProjects: () => projectQuery,
}))

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={['/vendors']}>
      <CurrentProjectProvider>
        <Routes>
          <Route
            path="/vendors"
            element={
              <RequireProject>
                <p>Vendor content</p>
              </RequireProject>
            }
          />
          <Route path="/projects" element={<p>Project picker</p>} />
        </Routes>
      </CurrentProjectProvider>
    </MemoryRouter>,
  )
}

describe('RequireProject', () => {
  beforeEach(() => {
    localStorage.clear()
    projectQuery.data = []
    projectQuery.isLoading = false
    projectQuery.isFetching = false
  })

  it('does not reject a freshly selected project while stale project data refetches', () => {
    localStorage.setItem('btp.currentProjectId', 'project-new')
    projectQuery.data = [
      { id: 'project-old-1', deletedAt: null },
      { id: 'project-old-2', deletedAt: null },
    ]
    projectQuery.isFetching = true

    renderGuard()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Project picker')).not.toBeInTheDocument()
    expect(localStorage.getItem('btp.currentProjectId')).toBe('project-new')
  })
})
