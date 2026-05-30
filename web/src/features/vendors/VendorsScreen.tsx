import { useState } from 'react'
import { Plus, Trash2, Contact, Phone, Mail } from 'lucide-react'
import type { Vendor } from '../../domain/types'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Sheet } from '../../components/ui/Sheet'
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
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null)

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
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add vendor
            </Button>
          ) : undefined
        }
      />

      {error && <p role="alert">Couldn’t load vendors: {(error as Error).message}</p>}
      {isLoading && <ListSkeleton />}

      {!isLoading && vendors.length === 0 ? (
        <EmptyState
          icon={Contact}
          title="No vendors yet"
          body="Keep your subs and suppliers — trade, phone, and email — in one place."
          action={
            <Button leadingIcon={<Plus size={16} />} onClick={() => setEditing('new')}>
              Add vendor
            </Button>
          }
        />
      ) : (
        <ul className="card-list">
          {vendors.map((v) => (
            <li key={v.id} className="expense-row">
              <button className="expense-row-open" onClick={() => setEditing(v)}>
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

      <Sheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'New vendor' : 'Edit vendor'}
      >
        {editing !== null && (
          <VendorForm
            projectId={projectId}
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        )}
      </Sheet>
    </section>
  )
}
