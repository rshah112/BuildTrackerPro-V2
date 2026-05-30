import { useState, type ChangeEvent, type FormEvent } from 'react'
import type { Bid, Vendor } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
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
  const [d, setD] = useState<Draft>(initial ?? blank(projectId, packageId))
  const create = useCreateBid()
  const update = useUpdateBid()
  const busy = create.isPending || update.isPending

  const text = (k: keyof Draft) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setD((p) => ({ ...p, [k]: e.target.value }))

  const chooseVendor = (e: ChangeEvent<HTMLSelectElement>) => {
    const v = vendors.find((x) => x.id === e.target.value)
    setD((p) => ({ ...p, vendorId: v?.id ?? null, vendorName: v?.name ?? p.vendorName ?? '' }))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (initial) await update.mutateAsync({ id: initial.id, patch: d })
    else await create.mutateAsync(d)
    onDone()
  }

  return (
    <form onSubmit={submit} className="form">
      <div className="form-section">
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
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => setD((p) => ({ ...p, amount: v }))} />
        <Field label="File name">{(p) => <input {...p} value={d.fileName ?? ''} onChange={text('fileName')} />}</Field>
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
