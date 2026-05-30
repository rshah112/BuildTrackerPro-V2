import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { Vendor } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Button } from '../../components/ui/Button'
import { useCreateVendor, useUpdateVendor } from './useVendors'

type Draft = Partial<Omit<Vendor, 'id' | 'owner'>>

const blank = (projectId: string): Draft => ({
  projectId,
  name: '',
  trade: '',
  phone: '',
  email: '',
  notes: '',
})

export function VendorForm({
  projectId,
  initial,
  onDone,
}: {
  projectId: string
  initial?: Vendor
  onDone: () => void
}) {
  const [d, setD] = useState<Draft>(initial ?? blank(projectId))
  const create = useCreateVendor()
  const update = useUpdateVendor()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync({ ...d, projectId })
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
        <Field label="Name">
          {(p) => <input {...p} value={d.name ?? ''} onChange={text('name')} required autoFocus />}
        </Field>
        <Field label="Trade">{(p) => <input {...p} value={d.trade ?? ''} onChange={text('trade')} />}</Field>
        <div className="form-grid">
          <Field label="Phone">
            {(p) => <input type="tel" {...p} value={d.phone ?? ''} onChange={text('phone')} />}
          </Field>
          <Field label="Email">
            {(p) => <input type="email" {...p} value={d.email ?? ''} onChange={text('email')} />}
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
