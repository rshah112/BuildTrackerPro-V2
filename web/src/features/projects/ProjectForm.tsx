import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { Project } from '../../domain/types'
import { PROJECT_STATUSES, PROJECT_PRIORITIES, PROJECT_TEMPLATE_TYPES } from '../../domain/enums'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { useToast } from '../../components/ui/Toast'
import { useCreateProject, useUpdateProject } from './useProjects'
import { seedProjectBudget } from './seedBudget'

type Draft = Partial<Project>

const blank: Draft = {
  name: '',
  address: '',
  status: 'planning',
  priority: 'normal',
  templateType: 'custom',
  purchasePrice: 0,
  closingCosts: 0,
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

export function ProjectForm({ initial, onDone }: { initial?: Project; onDone: (createdId?: string) => void }) {
  const [d, setD] = useState<Draft>(initial ?? blank)
  const create = useCreateProject()
  const update = useUpdateProject()
  const toast = useToast()
  const busy = create.isPending || update.isPending

  const text =
    (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setD((p) => ({ ...p, [k]: e.target.value }))
  const num =
    (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
      setD((p) => ({ ...p, [k]: e.target.value === '' ? null : Number(e.target.value) }))
  const money = (k: keyof Draft) => (v: number) => setD((p) => ({ ...p, [k]: v }))
  const date =
    (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
      setD((p) => ({ ...p, [k]: e.target.value === '' ? null : e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) {
      await update.mutateAsync({ id: initial.id, patch: d })
      onDone()
    } else {
      const created = await create.mutateAsync(d)
      const newId = (created as Project | undefined)?.id
      // Pre-populate the budget from the chosen template + construction budget (industry-
      // standard category % allocations). Best-effort: the project exists regardless.
      const budget = d.constructionBudget ?? 0
      if (newId && d.templateType && d.templateType !== 'custom' && budget > 0) {
        try {
          const n = await seedProjectBudget(newId, d.templateType, budget)
          if (n > 0) toast.success(`Pre-filled ${n} budget categories from the template`)
        } catch {
          toast.show('Project created — set up the budget categories manually')
        }
      }
      onDone(newId)
    }
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Name">
          {(p) => <input {...p} value={d.name ?? ''} onChange={text('name')} required autoFocus />}
        </Field>
        <Field label="Address">
          {(p) => <input {...p} value={d.address ?? ''} onChange={text('address')} />}
        </Field>
        <div className="form-grid">
          <Field label="Status">
            {(p) => (
              <Select {...p} value={d.status} onChange={text('status')}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Priority">
            {(p) => (
              <Select {...p} value={d.priority} onChange={text('priority')}>
                {PROJECT_PRIORITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Template">
          {(p) => (
            <Select {...p} value={d.templateType} onChange={text('templateType')}>
              {PROJECT_TEMPLATE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Form.Section>

      <Form.Section title="Budget">
        <CurrencyField
          label="Construction budget"
          value={d.constructionBudget ?? 0}
          onChange={money('constructionBudget')}
        />
        <CurrencyField
          label="Contingency budget"
          value={d.contingencyBudget ?? 0}
          onChange={money('contingencyBudget')}
        />
      </Form.Section>

      <Form.Section title="Land & acquisition">
        <CurrencyField
          label="Lot / land purchase price"
          value={d.purchasePrice ?? 0}
          onChange={money('purchasePrice')}
        />
        <CurrencyField label="Closing costs" value={d.closingCosts ?? 0} onChange={money('closingCosts')} />
        <p className="muted">
          Tracked separately from the construction budget — added to your all-in project cost, not to
          construction variance.
        </p>
      </Form.Section>

      <Form.Section title="Structure">
        <div className="form-grid">
          <Field label="Square footage">
            {(p) => (
              <input type="number" step="1" {...p} value={d.squareFootage ?? ''} onChange={num('squareFootage')} />
            )}
          </Field>
          <Field label="Stories">
            {(p) => (
              <input
                type="number"
                step="1"
                {...p}
                value={d.stories ?? 0}
                onChange={(e) =>
                  setD((prev) => ({ ...prev, stories: e.target.value === '' ? 0 : Number(e.target.value) }))
                }
              />
            )}
          </Field>
        </div>
        <Field label="Footprint">
          {(p) => <input {...p} value={d.footprint ?? ''} onChange={text('footprint')} />}
        </Field>
        <Field label="Basement">
          {(p) => <input {...p} value={d.basement ?? ''} onChange={text('basement')} />}
        </Field>
        <Field label="Lot dimensions">
          {(p) => <input {...p} value={d.lotDimensions ?? ''} onChange={text('lotDimensions')} />}
        </Field>
        <Field label="Proposed build dimensions">
          {(p) => (
            <input {...p} value={d.proposedBuildDimensions ?? ''} onChange={text('proposedBuildDimensions')} />
          )}
        </Field>
      </Form.Section>

      <Form.Section title="Dates">
        <div className="form-grid">
          <Field label="Start date">
            {(p) => <input type="date" {...p} value={dateValue(d.startDate)} onChange={date('startDate')} />}
          </Field>
          <Field label="Target finish">
            {(p) => (
              <input type="date" {...p} value={dateValue(d.targetFinishDate)} onChange={date('targetFinishDate')} />
            )}
          </Field>
        </div>
      </Form.Section>

      <Form.Section title="Notes">
        <Field label="Scope summary">
          {(p) => <textarea {...p} value={d.scopeSummary ?? ''} onChange={text('scopeSummary')} />}
        </Field>
        <Field label="Warranty notes">
          {(p) => <textarea {...p} value={d.warrantyNotes ?? ''} onChange={text('warrantyNotes')} />}
        </Field>
      </Form.Section>

      <Form.Actions busy={busy} onCancel={() => onDone()} />
    </Form>
  )
}
