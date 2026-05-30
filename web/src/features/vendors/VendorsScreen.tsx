import { Plus, Trash2, Contact, Phone, Mail } from 'lucide-react'
import type { Vendor } from '../../domain/types'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { EditorSheet } from '../../components/ui/EditorSheet'
import { useEditor } from '../../components/ui/useEditor'
import { EmptyState, ListSkeleton } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useVendors, useRemoveVendor } from './useVendors'
import { VendorForm } from './VendorForm'

export function VendorsScreen() {
  const { projectId } = useCurrentProject()
  const { data: vendors = [], isLoading, error } = useVendors(projectId!)
  const remove = useRemoveVendor()
  const toast = useToast()
  const editor = useEditor<Vendor>()

  if (!projectId) return null

  const del = async (v: Vendor) => {
    await remove.mutateAsync(v.id)
    toast.success('Vendor deleted')
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

      {error && <p role="alert" className="error-banner">Couldn’t load vendors: {(error as Error).message}</p>}
      {isLoading && <ListSkeleton />}

      {!isLoading && vendors.length === 0 ? (
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
      ) : (
        <ul className="card-list">
          {vendors.map((v) => (
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
                <div className="vendor-row-icons">
                  {v.phone && <Phone size={15} className="muted" aria-hidden />}
                  {v.email && <Mail size={15} className="muted" aria-hidden />}
                </div>
              </button>
              <button className="expense-row-del" onClick={() => del(v)} aria-label="Delete vendor">
                <Trash2 size={17} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <EditorSheet editor={editor} newTitle="New vendor" editTitle="Edit vendor">
        {(initial) => <VendorForm projectId={projectId} initial={initial} onDone={editor.close} />}
      </EditorSheet>
    </section>
  )
}
