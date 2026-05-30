import type { BidPackage } from '../../domain/types'
import { BID_PACKAGE_STATUSES } from '../../domain/enums'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
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
  const { d, text, date, busy, submit } = useEntityForm<BidPackage, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateBidPackage(),
    update: useUpdateBidPackage(),
    onDone,
  })

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Scope">
          {(p) => <input {...p} value={d.scopeTitle ?? ''} onChange={text('scopeTitle')} required autoFocus />}
        </Field>
        <div className="form-grid">
          <Field label="Status" hint="Award a bid to mark this package awarded.">
            {(p) => (
              <Select {...p} value={d.status === 'awarded' ? 'open' : d.status} onChange={text('status')}>
                {/* 'awarded' is set by awarding a bid, not chosen manually. */}
                {BID_PACKAGE_STATUSES.filter((s) => s !== 'awarded').map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
                {d.status === 'awarded' && <option value="awarded">awarded</option>}
              </Select>
            )}
          </Field>
          <Field label="Due date">
            {(p) => <input type="date" {...p} value={dateValue(d.dueDate)} onChange={date('dueDate')} />}
          </Field>
        </div>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
