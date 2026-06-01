import { useState } from 'react'
import { ImageOff } from 'lucide-react'
import type { BudgetLineItem, PhotoAttachment } from '../../domain/types'
import { fmt, sumBy, diff } from '../../lib/money'
import { Sheet } from '../../components/ui/Sheet'
import { SectionCard } from '../../components/ui/SectionCard'
import { FilePreview } from '../../components/ui/FilePreview'
import { PhotoThumb } from '../photos/PhotoThumb'

/** Detail for one room: budget/actual/variance, its line items, and its photos (tap to
 *  preview). Opened from the By Room list. */
export function RoomDetailSheet({
  room,
  items,
  photos,
  onClose,
}: {
  room: string | null
  items: BudgetLineItem[]
  photos: PhotoAttachment[]
  onClose: () => void
}) {
  const [preview, setPreview] = useState<PhotoAttachment | null>(null)
  if (!room) return null

  const budget = sumBy(items, (i) => i.budget)
  const actual = sumBy(items, (i) => i.actual)
  const variance = diff(actual, budget)
  const usedPct = budget > 0 ? Math.round((actual / budget) * 100) : 0
  const over = actual > budget && budget > 0

  return (
    <Sheet open={!!room} onClose={onClose} title={room}>
      <SectionCard
        title="Budget"
        trailing={<strong className={over ? 'danger-text' : undefined}>{fmt(actual)}</strong>}
        footnote={`${items.length} line item${items.length === 1 ? '' : 's'} · ${photos.length} photo${photos.length === 1 ? '' : 's'}`}
      >
        <div className="stat-list">
          <div className="kv-row"><span className="muted">Budget</span><strong>{fmt(budget)}</strong></div>
          <div className="kv-row"><span className="muted">Actual</span><strong>{fmt(actual)}</strong></div>
          <div className="kv-row">
            <span className="muted">Variance</span>
            <strong className={variance > 0 ? 'danger-text' : undefined}>
              {variance > 0 ? `${fmt(variance)} over` : `${fmt(Math.abs(variance))} under`}
            </strong>
          </div>
        </div>
        <div className="progress thin">
          <span className={over ? 'fill-danger' : 'fill-brand'} style={{ width: `${Math.min(100, usedPct)}%` }} />
        </div>
      </SectionCard>

      {items.length > 0 && (
        <SectionCard title="Line items">
          <ul className="stat-list">
            {items.map((li) => {
              const liOver = li.actual > li.budget && li.budget > 0
              return (
                <li key={li.id} className="kv-row">
                  <span>
                    {li.title}
                    {li.categoryName ? <span className="muted"> · {li.categoryName}</span> : null}
                  </span>
                  <span className={liOver ? 'danger-text tnum' : 'tnum'}>
                    {fmt(li.actual)} <span className="muted">/ {fmt(li.budget)}</span>
                  </span>
                </li>
              )
            })}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Photos">
        {photos.length === 0 ? (
          <p className="muted">
            <ImageOff size={14} aria-hidden style={{ verticalAlign: '-2px', marginRight: 4 }} />
            No photos tagged to this room yet.
          </p>
        ) : (
          <div className="photo-grid room-photos">
            {photos.map((ph) => (
              <div key={ph.id} className="photo-cell">
                <button
                  className="photo-open"
                  onClick={() => setPreview(ph)}
                  aria-label={`Preview photo: ${ph.notes || room}`}
                >
                  <PhotoThumb objectKey={ph.imageObjectKey} alt={ph.notes || room} />
                </button>
                {ph.phaseTag && <span className="photo-phase">{ph.phaseTag}</span>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <FilePreview
        open={!!preview}
        onClose={() => setPreview(null)}
        objectKey={preview?.imageObjectKey ?? null}
        title={preview?.notes || room}
      />
    </Sheet>
  )
}
