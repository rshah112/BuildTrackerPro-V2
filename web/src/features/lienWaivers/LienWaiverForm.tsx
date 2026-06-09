import type { LienWaiver } from '../../domain/types'
import { LIEN_WAIVER_TYPES, LIEN_WAIVER_TYPE_LABEL } from '../../domain/enums'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { SegmentedControl } from '../../components/ui/SegmentedControl'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateLienWaiver, useUpdateLienWaiver } from './useLienWaivers'
import { useVendors } from '../vendors/useVendors'
import { useEnsureVendor } from '../vendors/useEnsureVendor'
import { VendorPicker } from '../vendors/VendorPicker'

type Draft = Partial<Omit<LienWaiver, 'id' | 'owner' | 'createdAt'>>

const today = () => new Date().toISOString().slice(0, 10)
const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string): Draft => ({
  projectId,
  vendorName: '',
  expenseId: null,
  amount: 0,
  waiverType: 'conditional_progress',
  throughDate: today(),
  received: false,
  notes: '',
})

export function LienWaiverForm({
  projectId,
  initial,
  onDone,
}: {
  projectId: string
  initial?: LienWaiver
  onDone: () => void
}) {
  const { data: vendors = [] } = useVendors(projectId)
  const ensureVendor = useEnsureVendor(projectId)
  const { d, setD, set, text, date, busy, submit } = useEntityForm<LienWaiver, Draft>({
    initial,
    blank: blank(projectId),
    create: useCreateLienWaiver(),
    update: useUpdateLienWaiver(),
    // Auto-create a vendor profile for a typed name (best-effort), like the other forms.
    transform: async (draft) => {
      try {
        await ensureVendor(draft.vendorName)
      } catch {
        /* best-effort */
      }
      return draft
    },
    onDone,
  })

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <VendorPicker value={d.vendorName ?? ''} vendors={vendors} onChange={(v) => setD((p) => ({ ...p, vendorName: v }))} />
        <CurrencyField label="Amount covered" value={d.amount ?? 0} onChange={(v) => set('amount', v)} />
        <Field label="Waiver type">
          {(p) => (
            <Select {...p} value={d.waiverType} onChange={text('waiverType')}>
              {LIEN_WAIVER_TYPES.map((t) => (
                <option key={t} value={t}>
                  {LIEN_WAIVER_TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <div className="form-grid">
          <Field label="Through date" hint="Work covered through this date.">
            {(p) => <input type="date" {...p} value={dateValue(d.throughDate)} onChange={date('throughDate')} />}
          </Field>
          <div className="field">
            <span className="field-label">Status</span>
            <SegmentedControl
              ariaLabel="Waiver status"
              value={d.received ? 'received' : 'pending'}
              onChange={(v) => setD((p) => ({ ...p, received: v === 'received' }))}
              segments={[
                { value: 'pending', label: 'Pending' },
                { value: 'received', label: 'Received' },
              ]}
            />
          </div>
        </div>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
