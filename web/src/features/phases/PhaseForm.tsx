import type { Phase } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { clampPct } from './phaseMath'
import { useCreatePhase, useUpdatePhase } from './usePhases'

type Draft = Partial<Omit<Phase, 'id' | 'owner'>>

const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string, sortOrder: number): Draft => ({
  projectId,
  name: '',
  pctComplete: 0,
  sortOrder,
  targetDate: null,
  notes: '',
})

export function PhaseForm({
  projectId,
  initial,
  nextSortOrder,
  onDone,
}: {
  projectId: string
  initial?: Phase
  nextSortOrder: number
  onDone: () => void
}) {
  const { d, setD, text, date, busy, submit, submitError } = useEntityForm<Phase, Draft>({
    initial,
    blank: blank(projectId, nextSortOrder),
    create: useCreatePhase(),
    update: useUpdatePhase(),
    onDone,
    transform: (draft) => ({ ...draft, pctComplete: clampPct(draft.pctComplete ?? 0) }),
  })

  const pct = clampPct(d.pctComplete ?? 0)

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Phase">
          {(p) => <input {...p} value={d.name ?? ''} onChange={text('name')} required autoFocus />}
        </Field>
        <Field label={`Progress — ${pct}%`}>
          {() => (
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={pct}
              onChange={(e) => setD((prev) => ({ ...prev, pctComplete: Number(e.target.value) }))}
            />
          )}
        </Field>
        <Field label="Target date">
          {(p) => <input type="date" {...p} value={dateValue(d.targetDate)} onChange={date('targetDate')} />}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy} onCancel={onDone} saveLabel="Save phase" />
    </Form>
  )
}
