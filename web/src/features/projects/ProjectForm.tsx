import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { Project } from '../../domain/types'
import { PROJECT_STATUSES, PROJECT_PRIORITIES, PROJECT_TEMPLATE_TYPES } from '../../domain/enums'
import { useCreateProject, useUpdateProject } from './useProjects'

type Draft = Partial<Project>

const blank: Draft = {
  name: '',
  address: '',
  status: 'planning',
  priority: 'normal',
  templateType: 'custom',
  purchasePrice: 0,
  squareFootage: null,
  constructionBudget: 0,
  contingencyBudget: 0,
  lotDimensions: '',
  proposedBuildDimensions: '',
  footprint: '',
  stories: 0,
  basement: '',
  scopeSummary: '',
  warrantyNotes: '',
  startDate: null,
  targetFinishDate: null,
}

const dateValue = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

export function ProjectForm({ initial, onDone }: { initial?: Project; onDone: () => void }) {
  const [d, setD] = useState<Draft>(initial ?? blank)
  const create = useCreateProject()
  const update = useUpdateProject()
  const busy = create.isPending || update.isPending

  const text =
    (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setD((p) => ({ ...p, [k]: e.target.value }))
  const num =
    (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
      setD((p) => ({ ...p, [k]: e.target.value === '' ? null : Number(e.target.value) }))
  const date =
    (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
      setD((p) => ({ ...p, [k]: e.target.value === '' ? null : e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync(d)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <h1>{initial ? 'Edit project' : 'New project'}</h1>

      <label>Name<input value={d.name ?? ''} onChange={text('name')} required /></label>
      <label>Address<input value={d.address ?? ''} onChange={text('address')} /></label>

      <label>Status
        <select value={d.status} onChange={text('status')}>
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>Priority
        <select value={d.priority} onChange={text('priority')}>
          {PROJECT_PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label>Template
        <select value={d.templateType} onChange={text('templateType')}>
          {PROJECT_TEMPLATE_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>

      <label>Purchase price<input type="number" step="0.01" value={d.purchasePrice ?? 0} onChange={num('purchasePrice')} /></label>
      <label>Square footage<input type="number" step="1" value={d.squareFootage ?? ''} onChange={num('squareFootage')} /></label>
      <label>Construction budget<input type="number" step="0.01" value={d.constructionBudget ?? 0} onChange={num('constructionBudget')} /></label>
      <label>Contingency budget<input type="number" step="0.01" value={d.contingencyBudget ?? 0} onChange={num('contingencyBudget')} /></label>

      <label>Start date<input type="date" value={dateValue(d.startDate)} onChange={date('startDate')} /></label>
      <label>Target finish<input type="date" value={dateValue(d.targetFinishDate)} onChange={date('targetFinishDate')} /></label>

      <label>Lot dimensions<input value={d.lotDimensions ?? ''} onChange={text('lotDimensions')} /></label>
      <label>Proposed build dimensions<input value={d.proposedBuildDimensions ?? ''} onChange={text('proposedBuildDimensions')} /></label>
      <label>Footprint<input value={d.footprint ?? ''} onChange={text('footprint')} /></label>
      <label>Stories<input type="number" step="1" value={d.stories ?? 0} onChange={num('stories')} /></label>
      <label>Basement<input value={d.basement ?? ''} onChange={text('basement')} /></label>
      <label>Scope summary<textarea value={d.scopeSummary ?? ''} onChange={text('scopeSummary')} /></label>
      <label>Warranty notes<textarea value={d.warrantyNotes ?? ''} onChange={text('warrantyNotes')} /></label>

      <div className="form-actions">
        <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="secondary" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}
