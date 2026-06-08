import type { AllowanceSelection, BudgetLineItem } from '../../domain/types'
import { Field } from '../../components/ui/Field'
import { Select } from '../../components/ui/Select'
import { CurrencyField } from '../../components/ui/CurrencyField'
import { Form } from '../../components/ui/Form'
import { useEntityForm } from '../../lib/useEntityForm'
import { useCreateAllowance, useUpdateAllowance } from './useAllowances'
import { useVendors } from '../vendors/useVendors'
import { useEnsureVendor } from '../vendors/useEnsureVendor'
import { VendorPicker } from '../vendors/VendorPicker'

type Draft = Partial<Omit<AllowanceSelection, 'id' | 'owner'>>

const today = () => new Date().toISOString().slice(0, 10)
const dateValue = (v?: string | null) => (v ? v.slice(0, 10) : '')

const blank = (projectId: string, lineItemId: string): Draft => ({
  projectId,
  lineItemId,
  selectionDate: today(),
  vendor: '',
  amount: 0,
  notes: '',
  photoObjectKey: null,
})

export function AllowanceForm({
  projectId,
  lineItems,
  initial,
  onSaved,
  onDone,
}: {
  projectId: string
  lineItems: BudgetLineItem[]
  initial?: AllowanceSelection
  onSaved: (saved: AllowanceSelection) => Promise<void>
  onDone: () => void
}) {
  const { data: vendors = [] } = useVendors(projectId)
  const ensureVendor = useEnsureVendor(projectId)
  const { d, set, text, busy, submit } = useEntityForm<AllowanceSelection, Draft>({
    initial,
    blank: blank(projectId, lineItems[0]?.id ?? ''),
    create: useCreateAllowance(),
    update: useUpdateAllowance(),
    // Auto-create a vendor profile for a typed name (best-effort).
    transform: async (draft) => {
      try {
        await ensureVendor(draft.vendor)
      } catch {
        /* best-effort */
      }
      return draft
    },
    onSaved,
    onDone,
  })

  return (
    <Form onSubmit={submit}>
      <Form.Section>
        <Field label="Line item">
          {(p) => (
            <Select {...p} value={d.lineItemId ?? ''} onChange={text('lineItemId')} required>
              <option value="" disabled>
                Select a line item
              </option>
              {lineItems.map((li) => (
                <option key={li.id} value={li.id}>
                  {li.categoryName} / {li.title}
                  {li.isAllowance ? ' (allowance)' : ''}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <CurrencyField label="Amount" value={d.amount ?? 0} onChange={(v) => set('amount', v)} />
        <VendorPicker value={d.vendor ?? ''} vendors={vendors} onChange={(v) => set('vendor', v)} />
        <Field label="Selection date">
          {(p) => (
            <input
              type="date"
              {...p}
              value={dateValue(d.selectionDate)}
              onChange={(e) => set('selectionDate', e.target.value || today())}
            />
          )}
        </Field>
        <Field label="Notes">{(p) => <textarea {...p} value={d.notes ?? ''} onChange={text('notes')} />}</Field>
      </Form.Section>
      <Form.Actions busy={busy} onCancel={onDone} />
    </Form>
  )
}
