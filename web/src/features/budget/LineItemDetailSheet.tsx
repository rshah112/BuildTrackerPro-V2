import { Pencil, Copy } from 'lucide-react'
import type { BudgetLineItem } from '../../domain/types'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Stat } from '../../components/ui/Stat'
import { SectionCard } from '../../components/ui/SectionCard'
import { HealthPill } from './HealthPill'
import { useExpenses } from '../expenses/useExpenses'
import { usePhotos } from '../photos/usePhotos'
import { useAllowances } from '../allowances/useAllowances'
import { PhotoThumb } from '../photos/PhotoThumb'

const norm = (s: string) => s.trim().toLowerCase()

/** Read-only drill-down for a budget line item: its figures + everything tied to it
 *  (expenses, photos, allowance selections), with Edit / Duplicate actions. */
export function LineItemDetailSheet({
  item,
  onClose,
  onEdit,
  onDuplicate,
}: {
  item: BudgetLineItem
  onClose: () => void
  onEdit: () => void
  onDuplicate: () => void
}) {
  const { data: expenses = [] } = useExpenses(item.projectId)
  const { data: photos = [] } = usePhotos(item.projectId)
  const { data: selections = [] } = useAllowances(item.projectId)

  const limit = item.isAllowance ? item.allowanceAmount : item.budget
  const tiedExpenses = expenses.filter(
    (e) =>
      e.budgetLineItemId === item.id ||
      (!!item.title && norm(e.budgetLineItemTitle) === norm(item.title) && norm(e.categoryName) === norm(item.categoryName)),
  )
  const tiedPhotos = photos.filter((p) => p.budgetLineItemId === item.id)
  const tiedSelections = selections.filter((s) => s.lineItemId === item.id)
  const variance = limit - item.actual

  return (
    <Sheet open onClose={onClose} title={item.title}>
      <div className="kv-row">
        <span className="muted">
          {item.categoryName}
          {item.costCode ? ` · ${item.costCode}` : ''}
          {item.roomTag ? ` · ${item.roomTag}` : ''}
        </span>
        <HealthPill item={item} />
      </div>

      <div className="metric-grid compact">
        <Stat label={item.isAllowance ? 'Allowance' : 'Budget'} value={fmt(limit)} />
        <Stat label="Actual" value={fmt(item.actual)} tone={item.actual > limit && limit > 0 ? 'danger' : 'default'} />
        <Stat label="Variance" value={fmt(variance)} tone={variance < 0 ? 'danger' : 'default'} />
      </div>

      <SectionCard title={`Expenses (${tiedExpenses.length})`}>
        {tiedExpenses.length === 0 ? (
          <p className="muted">No expenses tied to this line item yet.</p>
        ) : (
          <ul className="plain-list">
            {tiedExpenses.map((e) => (
              <li key={e.id} className="kv-row">
                <span>
                  {e.vendorName || 'Expense'} <span className="muted">· {fmtDate(e.date)}</span>
                </span>
                <strong className="tnum">{fmt(e.amount)}</strong>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {item.isAllowance && (
        <SectionCard title={`Allowance selections (${tiedSelections.length})`}>
          {tiedSelections.length === 0 ? (
            <p className="muted">No selections recorded.</p>
          ) : (
            <ul className="plain-list">
              {tiedSelections.map((s) => (
                <li key={s.id} className="kv-row">
                  <span>{s.vendor || 'Selection'} <span className="muted">· {fmtDate(s.selectionDate)}</span></span>
                  <strong className="tnum">{fmt(s.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      {tiedPhotos.length > 0 && (
        <SectionCard title={`Photos (${tiedPhotos.length})`}>
          <div className="photo-grid">
            {tiedPhotos.map((p) => (
              <div key={p.id} className="photo-cell">
                <PhotoThumb objectKey={p.imageObjectKey} alt={p.notes || item.title} />
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <div className="form-actions form-actions-sticky">
        <Button leadingIcon={<Pencil size={16} />} fullWidth onClick={onEdit}>
          Edit
        </Button>
        <Button variant="secondary" leadingIcon={<Copy size={16} />} onClick={onDuplicate}>
          Duplicate
        </Button>
      </div>
    </Sheet>
  )
}
