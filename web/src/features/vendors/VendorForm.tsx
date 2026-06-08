import { useQueryClient } from '@tanstack/react-query'
import type { Vendor } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateVendor, useUpdateVendor } from './useVendors'
import { cascadeVendorRename } from './cascadeVendorRename'

type Draft = Partial<Omit<Vendor, 'id' | 'owner'>>

const blank = (projectId: string): Draft => ({
  projectId,
  name: '',
  trade: '',
  phone: '',
  email: '',
  notes: '',
  taxId: '',
  licenseNumber: '',
  insuranceExpiry: null,
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
  const qc = useQueryClient()
  const { d, text, date, busy, submit } = useEntityForm<Vendor, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateVendor(),
    update: useUpdateVendor(),
    // A rename must propagate to the name-linked expenses/allowances (see cascadeVendorRename).
    onSaved: async (saved) => {
      if (initial && saved.name !== initial.name) {
        await cascadeVendorRename(projectId, initial.name, saved.name)
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['expenses'] }),
          qc.invalidateQueries({ queryKey: ['allowance_selections'] }),
        ])
      }
    },
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
        <div className="form-grid">
          <Field label="Tax ID (W-9)" hint="EIN or SSN — for 1099 prep.">
            {(p) => <input {...p} value={d.taxId ?? ''} onChange={text('taxId')} autoComplete="off" />}
          </Field>
          <Field label="License #">
            {(p) => <input {...p} value={d.licenseNumber ?? ''} onChange={text('licenseNumber')} />}
          </Field>
        </div>
        <Field label="Insurance expiry (COI)" hint="You’ll get a warning as it nears expiry.">
          {(p) => (
            <input type="date" {...p} value={(d.insuranceExpiry ?? '').slice(0, 10)} onChange={date('insuranceExpiry')} />
          )}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
