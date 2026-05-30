import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronRight, Trash2, Pencil, FolderOpen } from 'lucide-react'
import type { Project } from '../../domain/types'
import type { ProjectStatus } from '../../domain/enums'
import { fmt } from '../../lib/money'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState, Skeleton } from '../../components/ui/Feedback'
import { useProjects, useUpdateProject } from './useProjects'
import { useCurrentProject } from './currentProject'
import { ProjectForm } from './ProjectForm'

const STATUS_TONE: Record<ProjectStatus, BadgeTone> = {
  planning: 'info',
  active: 'success',
  paused: 'warn',
  complete: 'neutral',
}

export function ProjectsScreen() {
  const { data: projects = [], isLoading, error } = useProjects()
  const update = useUpdateProject()
  const { setProjectId } = useCurrentProject()
  const navigate = useNavigate()
  const [editing, setEditing] = useState<Project | 'new' | null>(null)

  const active = projects.filter((p) => !p.deletedAt)
  const trashed = projects.filter((p) => p.deletedAt)

  const open = (p: Project) => {
    setProjectId(p.id)
    navigate('/', { viewTransition: true })
  }

  return (
    <section>
      <ScreenHeader
        title="Projects"
        trailing={
          active.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              New project
            </Button>
          ) : undefined
        }
      />

      {error && <p role="alert">Couldn’t load projects: {(error as Error).message}</p>}

      {isLoading ? (
        <div className="card-list">
          <Skeleton height="76px" radius="var(--radius-lg)" />
          <Skeleton height="76px" radius="var(--radius-lg)" />
        </div>
      ) : active.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          body="Create your first project to start tracking its budget, expenses, and photos."
          action={
            <Button leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              New project
            </Button>
          }
        />
      ) : (
        <ul className="card-list">
          {active.map((p) => {
            const budget = p.constructionBudget + p.contingencyBudget
            return (
              <li key={p.id} className="project-card">
                <button className="project-card-open" aria-label={p.name || 'Untitled'} onClick={() => open(p)}>
                  <div className="project-card-main">
                    <strong className="project-card-name">{p.name || 'Untitled'}</strong>
                    {p.address && <span className="project-card-addr">{p.address}</span>}
                  </div>
                  <ChevronRight className="project-card-chevron" size={20} aria-hidden />
                </button>
                <div className="project-card-footer">
                  <Badge tone={STATUS_TONE[p.status]}>{p.status}</Badge>
                  <span className="project-card-budget">{fmt(budget)} budget</span>
                  <span className="project-card-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      leadingIcon={<Pencil size={15} />}
                      onClick={() => setEditing(p)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      leadingIcon={<Trash2 size={15} />}
                      onClick={() => update.mutate({ id: p.id, patch: { deletedAt: new Date().toISOString() } })}
                    >
                      Trash
                    </Button>
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {trashed.length > 0 && (
        <>
          <h2 className="section-label">Trash</h2>
          <p className="muted">Deleted projects are kept 30 days before permanent removal.</p>
          <ul className="card-list">
            {trashed.map((p) => (
              <li key={p.id} className="project-card">
                <div className="project-card-footer">
                  <span className="muted" style={{ flex: 1 }}>
                    {p.name || 'Untitled'}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => update.mutate({ id: p.id, patch: { deletedAt: null } })}
                  >
                    Restore
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New project' : 'Edit project'}
      >
        {editing !== null && (
          <ProjectForm
            initial={editing === 'new' ? undefined : editing}
            onDone={(createdId) => {
              setEditing(null)
              // A newly created project becomes the active one and opens its dashboard.
              if (createdId) {
                setProjectId(createdId)
                navigate('/')
              }
            }}
          />
        )}
      </Sheet>
    </section>
  )
}
