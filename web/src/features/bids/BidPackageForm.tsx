import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { BidPackage } from '../../domain/types'
import { BID_PACKAGE_STATUSES } from '../../domain/enums'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Button } from '../../components/ui/Button'
import { useCreateBidPackage, useUpdateBidPackage } from './useBids'

type Draft = Partial<Omit<BidPackage, 'id' | 'owner' | 'createdAt'>>

const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string): Draft => ({
  projectId,
  scopeTitle: '',
  dueDate: null,
  status: 'open',
  awardedBidId: null,
  notes: '',
})

export function BidPackageForm({
  projectId,
  initial,
  onDone,
}: {
  projectId: string
  initial?: BidPackage
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId))
  const create = useCreateBidPackage()
  const update = useUpdateBidPackage()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))
  const date = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value || null }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync(d)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
        <Field label="Scope">
          {(p) => <input {...p} value={d.scopeTitle ?? ''} onChange={text('scopeTitle')} required autoFocus />}
        </Field>
        <div className="form-grid">
          <Field label="Status">
            {(p) => (
              <Select {...p} value={d.status} onChange={text('status')}>
                {BID_PACKAGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Due date">
            {(p) => <input type="date" {...p} value={dateValue(d.dueDate)} onChange={date('dueDate')} />}
          </Field>
        </div>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </div>
      <div className="form-actions form-actions-sticky">
        <Button type="submit" loading={busy} fullWidth>
          Save
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
