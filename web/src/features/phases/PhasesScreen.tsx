import { useState } from 'react'
import { Plus, Trash2, Activity, ChevronUp, ChevronDown, ListChecks } from 'lucide-react'
import type { Phase } from '../../domain/types'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { SectionCard } from '../../components/ui/SectionCard'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useRestoreRow } from '../../data/hooks'
import { fmtDate } from '../../lib/date'
import { useCurrentProject } from '../projects/currentProject'
import { usePhases, useCreatePhase, useUpdatePhase, useRemovePhase } from './usePhases'
import { PhaseForm } from './PhaseForm'
import { STANDARD_PHASES, phaseProgress, sortPhases, clampPct } from './phaseMath'

export function PhasesScreen() {
  const { projectId } = useCurrentProject()
  const { data: phases = [], isLoading, error } = usePhases(projectId!)
  const create = useCreatePhase()
  const update = useUpdatePhase()
  const remove = useRemovePhase()
  const restore = useRestoreRow('phases')
  const toast = useToast()
  const editor = useEditor<Phase>()
  const [seeding, setSeeding] = useState(false)

  if (!projectId) return null

  const sorted = sortPhases(phases)
  const progress = phaseProgress(phases)
  const nextSortOrder = sorted.length ? sorted[sorted.length - 1].sortOrder + 1 : 0

  const seedStandard = async () => {
    setSeeding(true)
    try {
      for (let i = 0; i < STANDARD_PHASES.length; i++) {
        await create.mutateAsync({ projectId, name: STANDARD_PHASES[i], pctComplete: 0, sortOrder: i, notes: '' })
      }
      toast.success('Standard phases added')
    } catch (e) {
      toast.error((e as Error).message || 'Couldn’t add phases')
    } finally {
      setSeeding(false)
    }
  }

  const del = async (p: Phase) => {
    await remove.mutateAsync(p.id)
    toast.success('Phase moved to Trash', { action: { label: 'Undo', onClick: () => restore.mutate(p.id) } })
  }

  // Swap sortOrder with the adjacent phase so the row visibly moves up/down.
  const swap = async (i: number, j: number) => {
    const a = sorted[i]
    const b = sorted[j]
    if (!a || !b) return
    await Promise.all([
      update.mutateAsync({ id: a.id, patch: { sortOrder: b.sortOrder } }),
      update.mutateAsync({ id: b.id, patch: { sortOrder: a.sortOrder } }),
    ])
  }

  return (
    <section>
      <ScreenHeader
        title="Build phases"
        subtitle="Track progress through each stage of the build"
        trailing={
          phases.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add phase
            </Button>
          ) : undefined
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={phases.length === 0}
        errorLabel="Couldn’t load phases"
        empty={
          <EmptyState
            icon={Activity}
            title="No phases yet"
            body="Add the standard construction phases, or build your own list, and track each to 100%."
            action={
              <div className="stack-sm">
                <Button leadingIcon={<ListChecks size={16} />} loading={seeding} onClick={seedStandard}>
                  Add standard phases
                </Button>
                <Button variant="secondary" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                  Add a phase
                </Button>
              </div>
            }
          />
        }
      >
        <SectionCard
          title="Overall progress"
          trailing={<strong>{progress.overall}%</strong>}
          footnote={`${progress.done} of ${progress.total} phases complete${progress.current ? ` · Now: ${progress.current.name}` : ''}`}
        >
          <div className="progress">
            <span className="fill-brand" style={{ width: `${progress.overall}%` }} />
          </div>
        </SectionCard>

        <ul className="card-list">
          {sorted.map((p, i) => {
            const pct = clampPct(p.pctComplete)
            return (
              <li key={p.id} className="phase-row">
                <div className="phase-reorder">
                  <button
                    className="phase-move"
                    onClick={() => swap(i, i - 1)}
                    disabled={i === 0 || update.isPending}
                    aria-label={`Move ${p.name} up`}
                  >
                    <ChevronUp size={16} aria-hidden />
                  </button>
                  <button
                    className="phase-move"
                    onClick={() => swap(i, i + 1)}
                    disabled={i === sorted.length - 1 || update.isPending}
                    aria-label={`Move ${p.name} down`}
                  >
                    <ChevronDown size={16} aria-hidden />
                  </button>
                </div>
                <button className="phase-open" onClick={() => editor.openEdit(p)}>
                  <div className="row-between">
                    <strong>{p.name}</strong>
                    <span className="muted tnum">{pct}%</span>
                  </div>
                  <div className="progress thin">
                    <span className="fill-brand" style={{ width: `${pct}%` }} />
                  </div>
                  {p.targetDate && <span className="muted">Target {fmtDate(p.targetDate)}</span>}
                </button>
                <button className="expense-row-del" onClick={() => del(p)} aria-label={`Delete ${p.name}`}>
                  <Trash2 size={17} aria-hidden />
                </button>
              </li>
            )
          })}
        </ul>
      </ListState>

      <EditorSheet editor={editor} newTitle="New phase" editTitle="Edit phase">
        {(initial) => (
          <PhaseForm projectId={projectId} initial={initial} nextSortOrder={nextSortOrder} onDone={editor.close} />
        )}
      </EditorSheet>
    </section>
  )
}
