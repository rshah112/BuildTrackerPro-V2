import { Plus, Trash2, ScrollText } from 'lucide-react'
import type { LienWaiver } from '../../domain/types'
import { LIEN_WAIVER_TYPE_LABEL } from '../../domain/enums'
import { fmt, sumBy } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Stat } from '../../components/ui/Stat'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useConfirm } from '../../components/ui/Confirm'
import { useRestoreRow } from '../../data/hooks'
import { useCurrentProject } from '../projects/currentProject'
import { useLienWaivers, useRemoveLienWaiver } from './useLienWaivers'
import { LienWaiverForm } from './LienWaiverForm'

export function LienWaiversScreen() {
  const { projectId } = useCurrentProject()
  const { data: waivers = [], isLoading, error } = useLienWaivers(projectId!)
  const remove = useRemoveLienWaiver()
  const restore = useRestoreRow('lien_waivers')
  const toast = useToast()
  const confirm = useConfirm()
  const editor = useEditor<LienWaiver>()

  if (!projectId) return null

  const received = waivers.filter((w) => w.received)
  const pending = waivers.filter((w) => !w.received)
  // Pending first, then by most recent through-date.
  const sorted = [...waivers].sort(
    (a, b) => Number(a.received) - Number(b.received) || (b.throughDate || '').localeCompare(a.throughDate || ''),
  )

  const del = async (w: LienWaiver) => {
    if (
      !(await confirm({
        title: 'Delete lien waiver?',
        message: `The ${LIEN_WAIVER_TYPE_LABEL[w.waiverType]} waiver from ${w.vendorName || 'this vendor'} will be moved to Trash.`,
        destructive: true,
      }))
    )
      return
    await remove.mutateAsync(w.id)
    toast.success('Lien waiver moved to Trash', { action: { label: 'Undo', onClick: () => restore.mutate(w.id) } })
  }

  return (
    <section>
      <ScreenHeader
        title="Lien waivers"
        subtitle="Waivers collected from your subs"
        trailing={
          waivers.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add waiver
            </Button>
          ) : undefined
        }
      />

      {waivers.length > 0 && (
        <div className="metric-grid compact">
          <Stat label="Received" value={String(received.length)} />
          <Stat label="Pending" value={String(pending.length)} tone={pending.length > 0 ? 'danger' : 'default'} />
          <Stat label="Covered (received)" value={fmt(sumBy(received, (w) => w.amount))} />
        </div>
      )}

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={waivers.length === 0}
        errorLabel="Couldn’t load lien waivers"
        empty={
          <EmptyState
            icon={ScrollText}
            title="No lien waivers yet"
            body="When you pay a sub, log the conditional/unconditional waiver you collect — it protects you and your lender from mechanic's liens."
            action={
              <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add waiver
              </Button>
            }
          />
        }
      >
        <ul className="card-list">
          {sorted.map((w) => (
            <li key={w.id} className="expense-row">
              <button className="expense-row-open" onClick={() => editor.openEdit(w)}>
                <div className="expense-row-main">
                  <strong>{w.vendorName || 'Vendor'}</strong>
                  <span className="muted">
                    {LIEN_WAIVER_TYPE_LABEL[w.waiverType]}
                    {w.throughDate ? ` · through ${fmtDate(w.throughDate)}` : ''}
                  </span>
                </div>
                <div className="expense-row-amount">
                  <Badge tone={w.received ? 'success' : 'warn'}>{w.received ? 'Received' : 'Pending'}</Badge>
                  <strong className="tnum">{fmt(w.amount)}</strong>
                </div>
              </button>
              <button className="expense-row-del" onClick={() => del(w)} aria-label="Delete waiver">
                <Trash2 size={17} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </ListState>

      <EditorSheet editor={editor} newTitle="Add lien waiver" editTitle="Edit lien waiver">
        {(initial) => <LienWaiverForm projectId={projectId} initial={initial} onDone={editor.close} />}
      </EditorSheet>
    </section>
  )
}
