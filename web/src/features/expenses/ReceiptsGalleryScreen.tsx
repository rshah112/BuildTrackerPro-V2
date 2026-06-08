import { useMemo, useState } from 'react'
import { Receipt } from 'lucide-react'
import type { Expense } from '../../domain/types'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { ScreenHeader } from '../../app/ScreenHeader'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { FilePreview } from '../../components/ui/FilePreview'
import { useCurrentProject } from '../projects/currentProject'
import { PhotoThumb } from '../photos/PhotoThumb'
import { useExpenses } from './useExpenses'

export function ReceiptsGalleryScreen() {
  const { projectId } = useCurrentProject()
  const { data: expenses = [], isLoading, error } = useExpenses(projectId!)
  // Tap a receipt to preview it in-app (window.open(_blank) silently fails in an installed PWA).
  const [preview, setPreview] = useState<Expense | null>(null)

  const withReceipts = useMemo(
    () =>
      expenses
        .filter((e) => e.receiptObjectKey)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses],
  )

  if (!projectId) return null

  return (
    <section>
      <ScreenHeader title="Receipts" subtitle="Every attached receipt in one place" />
      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={withReceipts.length === 0}
        errorLabel="Couldn’t load receipts"
        empty={
          <EmptyState
            icon={Receipt}
            title="No receipts yet"
            body="Attach a receipt image or PDF when logging an expense and it shows up here."
          />
        }
      >
        <div className="photo-grid">
          {withReceipts.map((e) => (
            <div key={e.id} className="photo-cell">
              <button
                className="photo-open"
                onClick={() => setPreview(e)}
                aria-label={`Receipt: ${e.vendorName || 'Expense'} ${fmt(e.amount)} on ${fmtDate(e.date)}`}
              >
                <PhotoThumb objectKey={e.receiptObjectKey} alt={`${e.vendorName || 'Expense'} receipt`} />
              </button>
              <span className="photo-phase">{fmt(e.amount)}</span>
            </div>
          ))}
        </div>
      </ListState>

      <FilePreview
        open={!!preview}
        onClose={() => setPreview(null)}
        objectKey={preview?.receiptObjectKey ?? null}
        title={preview ? `${preview.vendorName || 'Receipt'} · ${fmt(preview.amount)}` : undefined}
        autoFallback
      />
    </section>
  )
}
