import { useState } from 'react'
import { Pencil, CheckCircle2, RotateCcw } from 'lucide-react'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { SectionCard } from '../../components/ui/SectionCard'
import { Sheet } from '../../components/ui/Sheet'
import { ListSkeleton } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from './currentProject'
import { useProjects, useUpdateProject } from './useProjects'
import { ProjectForm } from './ProjectForm'

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === '' || value === null || value === undefined) return null
  return (
    <div className="kv-row">
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  )
}

export function ProjectInfoScreen() {
  const { projectId } = useCurrentProject()
  const { data: projects = [], isLoading, error } = useProjects()
  const update = useUpdateProject()
  const toast = useToast()
  const [editing, setEditing] = useState(false)

  if (!projectId) return null
  if (error)
    return (
      <p role="alert" className="error-banner">
        Couldn’t load the project: {(error as Error).message}
      </p>
    )
  if (isLoading) return <ListSkeleton />

  const project = projects.find((p) => p.id === projectId)
  if (!project) return null

  const isComplete = project.status === 'complete'
  const toggleComplete = async () => {
    await update.mutateAsync({ id: project.id, patch: { status: isComplete ? 'active' : 'complete' } })
    toast.success(isComplete ? 'Project reopened' : 'Project marked complete')
  }

  return (
    <section>
      <ScreenHeader
        title="Project Info"
        trailing={
          <Button size="sm" variant="ghost" leadingIcon={<Pencil size={15} />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      />

      <SectionCard
        title={project.name}
        trailing={<Badge tone="neutral">{project.status}</Badge>}
        footnote={project.address || undefined}
      >
        <div className="stat-list">
          <Row label="Priority" value={project.priority} />
          <Row label="Template" value={project.templateType} />
        </div>
      </SectionCard>

      <SectionCard title="Budget">
        <div className="stat-list">
          <Row label="Construction budget" value={fmt(project.constructionBudget)} />
          <Row label="Contingency" value={fmt(project.contingencyBudget)} />
          <Row label="Purchase price" value={project.purchasePrice ? fmt(project.purchasePrice) : ''} />
        </div>
      </SectionCard>

      <SectionCard title="Structure">
        <div className="stat-list">
          <Row label="Square footage" value={project.squareFootage ? `${project.squareFootage.toLocaleString()} sqft` : ''} />
          <Row label="Stories" value={project.stories || ''} />
          <Row label="Footprint" value={project.footprint} />
          <Row label="Basement" value={project.basement} />
          <Row label="Lot dimensions" value={project.lotDimensions} />
          <Row label="Proposed build" value={project.proposedBuildDimensions} />
        </div>
      </SectionCard>

      <SectionCard title="Schedule">
        <div className="stat-list">
          <Row label="Start date" value={project.startDate ? fmtDate(project.startDate) : ''} />
          <Row label="Target finish" value={project.targetFinishDate ? fmtDate(project.targetFinishDate) : ''} />
        </div>
      </SectionCard>

      {(project.scopeSummary || project.warrantyNotes) && (
        <SectionCard title="Scope & warranty">
          {project.scopeSummary && <p className="panel-lead">{project.scopeSummary}</p>}
          {project.warrantyNotes && <p className="muted">{project.warrantyNotes}</p>}
        </SectionCard>
      )}

      <div style={{ marginTop: '1rem' }}>
        <Button
          variant="secondary"
          fullWidth
          leadingIcon={isComplete ? <RotateCcw size={16} /> : <CheckCircle2 size={16} />}
          loading={update.isPending}
          onClick={toggleComplete}
        >
          {isComplete ? 'Reopen project' : 'Mark complete'}
        </Button>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Edit project">
        {editing && <ProjectForm initial={project} onDone={() => setEditing(false)} />}
      </Sheet>
    </section>
  )
}
