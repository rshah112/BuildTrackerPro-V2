import { useMemo } from 'react'
import { Receipt } from 'lucide-react'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { signedDownloadUrl } from '../../lib/r2'
import { ScreenHeader } from '../../app/ScreenHeader'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { PhotoThumb } from '../photos/PhotoThumb'
import { useExpenses } from './useExpenses'

export function ReceiptsGalleryScreen() {
  const { projectId } = useCurrentProject()
  const { data: expenses = [], isLoading, error } = useExpenses(projectId!)
  const toast = useToast()

  const withReceipts = useMemo(
    () =>
      expenses
        .filter((e) => e.receiptObjectKey)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [expenses],
  )

  const open = async (key: string | null) => {
    if (!key) return
    try {
      const url = await signedDownloadUrl(key)
      if (url) window.open(url, '_blank', 'noopener')
    } catch {
      toast.error('Couldn’t open the receipt')
    }
  }

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
                onClick={() => open(e.receiptObjectKey)}
                aria-label={`Receipt: ${e.vendorName || 'Expense'} ${fmt(e.amount)} on ${fmtDate(e.date)}`}
              >
                <PhotoThumb objectKey={e.receiptObjectKey} alt={`${e.vendorName || 'Expense'} receipt`} />
              </button>
              <span className="photo-phase">{fmt(e.amount)}</span>
            </div>
          ))}
        </div>
      </ListState>
    </section>
  )
}
