import { useMemo, useState } from 'react'
import { Grid2x2 } from 'lucide-react'
import type { BudgetLineItem } from '../../domain/types'
import { fmt, sumBy } from '../../lib/money'
import { ScreenHeader } from '../../app/ScreenHeader'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useCurrentProject } from '../projects/currentProject'
import { useLineItems } from '../budget/useBudget'
import { usePhotos } from '../photos/usePhotos'
import { RoomDetailSheet } from './RoomDetailSheet'

const roomOf = (tag: string | null | undefined) => tag?.trim() || 'Unassigned'
const EMPTY_ROWS: never[] = []

function pct(actual: number, budget: number): number {
  if (budget <= 0) return 0
  return Math.min(100, Math.max(0, (actual / budget) * 100))
}

export function RoomSummaryScreen() {
  const { projectId } = useCurrentProject()
  const lineItemsQuery = useLineItems(projectId!)
  const photosQuery = usePhotos(projectId!)
  const lineItems = lineItemsQuery.data ?? EMPTY_ROWS
  const photos = photosQuery.data ?? EMPTY_ROWS
  const isLoading = lineItemsQuery.isLoading || photosQuery.isLoading
  const error = lineItemsQuery.error ?? photosQuery.error
  const [active, setActive] = useState<string | null>(null)

  const rooms = useMemo(() => {
    const items = new Map<string, BudgetLineItem[]>()
    for (const li of lineItems) {
      const room = li.roomTag?.trim() || 'Unassigned'
      const arr = items.get(room)
      if (arr) arr.push(li)
      else items.set(room, [li])
    }
    const photoCounts = new Map<string, number>()
    for (const ph of photos) {
      const room = ph.roomTag?.trim() || 'Unassigned'
      photoCounts.set(room, (photoCounts.get(room) ?? 0) + 1)
    }
    const names = new Set<string>([...items.keys(), ...photoCounts.keys()])
    return [...names]
      .map((name) => {
        const arr = items.get(name) ?? []
        return {
          name,
          budget: sumBy(arr, (i) => i.budget),
          actual: sumBy(arr, (i) => i.actual),
          lineItems: arr.length,
          photos: photoCounts.get(name) ?? 0,
        }
      })
      .sort((a, b) => b.budget - a.budget || b.actual - a.actual)
  }, [lineItems, photos])

  if (!projectId) return null

  return (
    <section>
      <ScreenHeader title="By Room" subtitle="Budget, spend and photos by area" />
      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={rooms.length === 0}
        errorLabel="Couldn’t load room summary"
        empty={
          <EmptyState
            icon={Grid2x2}
            title="Nothing tagged by room yet"
            body="Add a room tag to budget line items or photos to see spend and documentation rolled up by area."
          />
        }
      >
        <ul className="card-list">
          {rooms.map((r) => {
            const over = r.actual > r.budget && r.budget > 0
            return (
              <li key={r.name} className="budget-cat">
                <button className="room-open" onClick={() => setActive(r.name)} aria-label={`Open ${r.name}`}>
                  <div className="budget-cat-titlerow">
                    <strong>{r.name}</strong>
                    <span className="muted">
                      {r.lineItems} item{r.lineItems === 1 ? '' : 's'}
                      {r.photos > 0 ? ` · ${r.photos} photo${r.photos === 1 ? '' : 's'}` : ''}
                      <span className="list-row-chevron" aria-hidden> ›</span>
                    </span>
                  </div>
                  <div className="budget-cat-figures">
                    <span className={over ? 'danger-text' : 'muted'}>
                      {fmt(r.actual)} <span className="muted">/ {fmt(r.budget)}</span>
                    </span>
                  </div>
                  <div className="progress thin">
                    <span className={over ? 'fill-danger' : 'fill-brand'} style={{ width: `${pct(r.actual, r.budget)}%` }} />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>

        <RoomDetailSheet
          room={active}
          items={lineItems.filter((li) => roomOf(li.roomTag) === active)}
          photos={photos.filter((ph) => roomOf(ph.roomTag) === active)}
          onClose={() => setActive(null)}
        />
      </ListState>
    </section>
  )
}
