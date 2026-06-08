import { useState } from 'react'
import { Plus, Trash2, FileText } from 'lucide-react'
import type { Bid, BidLine, Vendor } from '../../domain/types'
import { fmt, sumBy } from '../../lib/money'
import { uploadBlob, signedDownloadUrl } from '../../lib/r2'
import { Field } from '../../components/ui/Field'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { FileUploadField } from '../../components/ui/FileUploadField'
import { Button } from '../../components/ui/Button'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateBid, useUpdateBid } from './useBids'
import { useEnsureVendor } from '../vendors/useEnsureVendor'
import { VendorPicker } from '../vendors/VendorPicker'

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
  const [bidFile, setBidFile] = useState<File | null>(null)
  const ensureVendor = useEnsureVendor(projectId)
  const { d, setD, set, text, busy, submit, submitError } = useEntityForm<Bid, Draft>({
    initial,
    blank: blank(projectId, packageId),
    create: useCreateBid(),
    update: useUpdateBid(),
    transform: async (draft) => {
      // Resolve (or auto-create) the vendor by the typed name and store its id for the link.
      let vendorId = draft.vendorId ?? null
      const v = await ensureVendor(draft.vendorName).catch(() => null)
      if (v) vendorId = v.id
      if (!bidFile) return { ...draft, vendorId }
      // Upload an attached bid PDF/image to R2 (presigned) and store its object key + name.
      const { key } = await uploadBlob(bidFile, 'bid')
      return { ...draft, vendorId, fileObjectKey: key, fileName: draft.fileName?.trim() || bidFile.name }
    },
    onDone,
  })

  const openFile = async () => {
    if (!d.fileObjectKey) return
    const url = await signedDownloadUrl(d.fileObjectKey)
    if (url) window.open(url, '_blank', 'noopener')
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
        <VendorPicker
          value={d.vendorName ?? ''}
          vendors={vendors}
          onChange={(name) => setD((p) => ({ ...p, vendorName: name }))}
        />
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => set('amount', v)} />
        <FileUploadField
          label="Bid document"
          fileAccept="image/*,application/pdf"
          fileLabel={bidFile || d.fileObjectKey ? 'Replace file' : 'Attach PDF / image'}
          fileIcon={<FileText size={16} />}
          hint="The vendor's quote — stored securely so you can pull it up later."
          onPick={(f) => {
            setBidFile(f)
            if (f) setD((p) => ({ ...p, fileName: p.fileName?.trim() ? p.fileName : f.name }))
          }}
        />
        {(bidFile || d.fileObjectKey) && (
          <div className="row-between">
            <p className="muted" style={{ margin: 0 }}>{bidFile ? bidFile.name : d.fileName || 'File attached'}</p>
            {d.fileObjectKey && !bidFile && (
              <Button type="button" size="sm" variant="secondary" onClick={openFile}>
                View
              </Button>
            )}
          </div>
        )}
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

      {submitError && (
        <p role="alert" className="error-banner">
          {submitError}
        </p>
      )}
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
