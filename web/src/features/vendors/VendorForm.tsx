import type { Vendor } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
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
  const { d, text, busy, submit } = useEntityForm<Vendor, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateVendor(),
    update: useUpdateVendor(),
    onDone,
  })

  return (
    <Form onSubmit={submit}>
      <Form.Section>
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
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
