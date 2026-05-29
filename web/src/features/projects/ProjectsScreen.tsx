import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Project } from '../../domain/types'
import { useProjects, useUpdateProject } from './useProjects'
import { useCurrentProject } from './currentProject'
import { ProjectForm } from './ProjectForm'

export function ProjectsScreen() {
  const { data: projects = [], isLoading, error } = useProjects()
  const update = useUpdateProject()
  const { setProjectId } = useCurrentProject()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  if (editing) {
    return <ProjectForm initial={editing === 'new' ? undefined : editing} onDone={() => setEditing(null)} />
  }
  if (isLoading) return <div className="loading">Loading projects…</div>
  if (error) return <p role="alert">Couldn’t load projects: {(error as Error).message}</p>

  const active = projects.filter((p) => !p.deletedAt)
  const trashed = projects.filter((p) => p.deletedAt)

  const open = (p: Project) => {
    setProjectId(p.id)
    navigate('/')
  }

  return (
    <section>
      <div className="row-between">
        <h1>Projects</h1>
        <button onClick={() => setEditing('new')}>New project</button>
      </div>

      {active.length === 0 && <p>No projects yet — create your first one.</p>}
      <ul className="card-list">
        {active.map((p) => (
          <li key={p.id} className="card">
            <button className="link" onClick={() => open(p)}>
              <strong>{p.name || 'Untitled'}</strong>
              {p.address && <span className="muted"> · {p.address}</span>}
            </button>
            <div className="card-actions">
              <button className="secondary" onClick={() => setEditing(p)}>Edit</button>
              <button
                className="danger"
                onClick={() => update.mutate({ id: p.id, patch: { deletedAt: new Date().toISOString() } })}
              >
                Trash
              </button>
            </div>
          </li>
        ))}
      </ul>

      {trashed.length > 0 && (
        <>
          <h2>Trash</h2>
          <p className="muted">Deleted projects are kept 30 days before permanent removal.</p>
          <ul className="card-list">
            {trashed.map((p) => (
              <li key={p.id} className="card">
                <span className="muted">{p.name || 'Untitled'}</span>
                <button className="secondary" onClick={() => update.mutate({ id: p.id, patch: { deletedAt: null } })}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
