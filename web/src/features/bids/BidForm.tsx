import type { ChangeEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { Bid, BidLine, Vendor } from '../../domain/types'
import { fmt, sumBy } from '../../lib/money'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Button } from '../../components/ui/Button'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateBid, useUpdateBid } from './useBids'

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.round(performance.now())}`)

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

  const lines = d.lineItems ?? []
  const setLines = (next: BidLine[]) => setD((p) => ({ ...p, lineItems: next }))
  const addLine = () => setLines([...lines, { id: uid(), title: '', amount: 0 }])
  const updateLine = (id: string, patch: Partial<BidLine>) =>
    setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const removeLine = (id: string) => setLines(lines.filter((l) => l.id !== id))
  const linesTotal = sumBy(lines, (l) => l.amount)

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

      <Form.Section title="Line-item breakdown (optional)">
        {lines.map((l) => (
          <div key={l.id} className="bid-line-row">
            <Field label="Item">
              {(p) => <input {...p} value={l.title} onChange={(e) => updateLine(l.id, { title: e.target.value })} />}
            </Field>
            <CurrencyField label="Amount" value={l.amount} onChange={(v) => updateLine(l.id, { amount: v })} />
            <button type="button" className="expense-row-del" onClick={() => removeLine(l.id)} aria-label="Remove line">
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        ))}
        <div className="row-between">
          <Button type="button" size="sm" variant="secondary" leadingIcon={<Plus size={14} />} onClick={addLine}>
            Add line item
          </Button>
          {lines.length > 0 && <span className="muted">Breakdown total: {fmt(linesTotal)}</span>}
        </div>
      </Form.Section>

      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
