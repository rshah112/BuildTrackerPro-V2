import { useState } from 'react'
import { Plus, Trash2, Contact, Phone, Mail } from 'lucide-react'
import type { Vendor } from '../../domain/types'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { SearchField } from '../../components/ui/SearchField'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { EmptyState, ListState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useRestoreRow } from '../../data/hooks'
import { matchesQuery } from '../../lib/search'
import { useVendors, useRemoveVendor } from './useVendors'
import { VendorForm } from './VendorForm'

export function VendorsScreen() {
  const { projectId } = useCurrentProject()
  const { data: vendors = [], isLoading, error } = useVendors(projectId!)
  const remove = useRemoveVendor()
  const restore = useRestoreRow('vendors')
  const toast = useToast()
  const editor = useEditor<Vendor>()
  const [q, setQ] = useState('')

  if (!projectId) return null

  const visible = vendors.filter((v) => matchesQuery(q, v.name, v.trade, v.phone, v.email, v.notes))

  const del = async (v: Vendor) => {
    await remove.mutateAsync(v.id)
    toast.success('Vendor moved to Trash', { action: { label: 'Undo', onClick: () => restore.mutate(v.id) } })
  }

  return (
    <section>
      <ScreenHeader
        title="Vendors"
        trailing={
          vendors.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
              Add vendor
            </Button>
          ) : undefined
        }
      />

      <ListState
        error={error}
        isLoading={isLoading}
        isEmpty={vendors.length === 0}
        errorLabel="Couldn’t load vendors"
        empty={
          <EmptyState
            icon={Contact}
            title="No vendors yet"
            body="Keep your subs and suppliers — trade, phone, and email — in one place."
            action={
              <Button leadingIcon={<Plus size={16} />} onClick={editor.openNew}>
                Add vendor
              </Button>
            }
          />
        }
      >
        {vendors.length > 2 && <SearchField value={q} onChange={setQ} placeholder="Search vendor, trade, phone, email" />}
        {visible.length === 0 ? (
          <p className="muted">No vendors match “{q}”.</p>
        ) : (
        <ul className="card-list">
          {visible.map((v) => (
            <li key={v.id} className="expense-row">
              <button className="expense-row-open" onClick={() => editor.openEdit(v)}>
                <div className="expense-row-main">
                  <strong>{v.name}</strong>
                  <span className="muted">
                    {v.trade || 'Vendor'}
                    {v.phone ? ` · ${v.phone}` : ''}
                    {v.email ? ` · ${v.email}` : ''}
                  </span>
                </div>
              </button>
              {v.phone && (
                <a className="expense-row-del" href={`tel:${v.phone}`} aria-label={`Call ${v.name}`}>
                  <Phone size={17} aria-hidden />
                </a>
              )}
              {v.email && (
                <a className="expense-row-del" href={`mailto:${v.email}`} aria-label={`Email ${v.name}`}>
                  <Mail size={17} aria-hidden />
                </a>
              )}
              <button className="expense-row-del" onClick={() => del(v)} aria-label="Delete vendor">
                <Trash2 size={17} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        )}
      </ListState>

      <EditorSheet editor={editor} newTitle="New vendor" editTitle="Edit vendor">
        {(initial) => <VendorForm projectId={projectId} initial={initial} onDone={editor.close} />}
      </EditorSheet>
    </section>
  )
}
