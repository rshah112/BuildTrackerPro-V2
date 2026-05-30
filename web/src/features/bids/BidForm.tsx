import type { ChangeEvent } from 'react'
import type { Bid, Vendor } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateBid, useUpdateBid } from './useBids'

type Draft = Partial<Omit<Bid, 'id' | 'owner' | 'createdAt'>>

const blank = (projectId: string, packageId: string): Draft => ({
  projectId,
  packageId,
  vendorId: null,
  vendorName: '',
  amount: 0,
  fileObjectKey: null,
  fileName: '',
  notes: '',
  lineItems: [],
  awardedAt: null,
})

export function BidForm({
  projectId,
  packageId,
  vendors,
  initial,
  onDone,
}: {
  projectId: string
  packageId: string
  vendors: Vendor[]
  initial?: Bid
  onDone: () => void
}) {
  const { d, setD, set, text, busy, submit } = useEntityForm<Bid, Draft>({
    initial,
    blank: blank(projectId, packageId),
    create: useCreateBid(),
    update: useUpdateBid(),
    onDone,
  })

  const chooseVendor = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = vendors.find((x) => x.id === e.target.value)
    setD((p) => ({ ...p, vendorId: v?.id ?? null, vendorName: v?.name ?? p.vendorName ?? '' }))
  }

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Vendor">
          {(p) => <input {...p} value={d.vendorName ?? ''} onChange={text('vendorName')} required autoFocus />}
        </Field>
        {vendors.length > 0 && (
          <Field label="Or pick a saved vendor">
            {(p) => (
              <Select {...p} value={d.vendorId ?? ''} onChange={chooseVendor}>
                <option value="">—</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => set('amount', v)} />
        <Field label="File name">{(p) => <input {...p} value={d.fileName ?? ''} onChange={text('fileName')} />}</Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
