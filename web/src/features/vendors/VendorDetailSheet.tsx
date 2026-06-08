import { Phone, Mail, Pencil, Receipt, FileText, ClipboardList } from 'lucide-react'
import type { Bid, Expense, ProjectTask, Vendor } from '../../domain/types'
import { fmt } from '../../lib/money'
import { fmtDate } from '../../lib/date'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Stat } from '../../components/ui/Stat'
import { vendorRollup } from './vendorRollup'
import { coiStatus } from './coi'

/** Vendor 360: tap a vendor to see their total invoiced / paid / open across the project plus
 *  their linked expenses, bids, and tasks — with tap-to-call/email and a jump to edit contact
 *  details. Turns the Vendors tab from an address book into a hub. */
export function VendorDetailSheet({
  open,
  vendor,
  expenses,
  bids,
  tasks,
  onClose,
  onEdit,
}: {
  open: boolean
  vendor: Vendor | null
  expenses: Expense[]
  bids: Bid[]
  tasks: ProjectTask[]
  onClose: () => void
  onEdit: (v: Vendor) => void
}) {
  const roll = vendor ? vendorRollup(vendor, expenses, bids, tasks) : null
  const nothing = roll && roll.expenses.length === 0 && roll.bids.length === 0 && roll.tasks.length === 0
  const coi = vendor ? coiStatus(vendor.insuranceExpiry) : 'none'

  return (
    <Sheet open={open} onClose={onClose} title={vendor?.name ?? 'Vendor'}>
      {vendor && roll && (
        <div className="vendor-profile">
          <div className="row-between">
            <span className="muted">{vendor.trade || 'Vendor'}</span>
            <span style={{ display: 'inline-flex', gap: 8 }}>
              {vendor.phone && (
                <a className="btn btn-secondary btn-sm" href={`tel:${vendor.phone}`} aria-label={`Call ${vendor.name}`}>
                  <Phone size={15} aria-hidden /> Call
                </a>
              )}
              {vendor.email && (
                <a className="btn btn-secondary btn-sm" href={`mailto:${vendor.email}`} aria-label={`Email ${vendor.name}`}>
                  <Mail size={15} aria-hidden /> Email
                </a>
              )}
            </span>
          </div>

          {(coi === 'expired' || coi === 'expiring') && (
            <p role="alert" className="error-banner">
              {coi === 'expired' ? 'Insurance certificate has EXPIRED' : 'Insurance certificate expires within 30 days'}{' '}
              — request an updated COI.
            </p>
          )}

          <div className="metric-grid compact">
            <Stat label="Invoiced" value={fmt(roll.invoiced)} />
            <Stat label="Paid" value={fmt(roll.paid)} />
            <Stat label="Open" value={fmt(roll.open)} />
          </div>

          {(vendor.taxId || vendor.licenseNumber || vendor.insuranceExpiry) && (
            <section>
              <h3 className="section-label">Compliance</h3>
              <ul className="plain-list">
                <li className="kv-row">
                  <span className="muted">W-9 / Tax ID</span>
                  <span>{vendor.taxId ? '✓ on file' : '—'}</span>
                </li>
                {vendor.licenseNumber && (
                  <li className="kv-row">
                    <span className="muted">License</span>
                    <span>{vendor.licenseNumber}</span>
                  </li>
                )}
                <li className="kv-row">
                  <span className="muted">Insurance (COI)</span>
                  <span className={coi === 'expired' || coi === 'expiring' ? 'danger-text' : undefined}>
                    {vendor.insuranceExpiry ? `expires ${fmtDate(vendor.insuranceExpiry)}` : 'not tracked'}
                  </span>
                </li>
              </ul>
            </section>
          )}

          {roll.expenses.length > 0 && (
            <section>
              <h3 className="section-label">
                <Receipt size={14} aria-hidden /> Expenses ({roll.expenses.length})
              </h3>
              <ul className="plain-list">
                {roll.expenses.slice(0, 8).map((e) => (
                  <li key={e.id} className="kv-row">
                    <span>
                      {e.invoiceNumber ? `Inv ${e.invoiceNumber}` : e.categoryName || 'Expense'}{' '}
                      <span className="muted">· {fmtDate(e.date)}</span>
                    </span>
                    <strong className="tnum">{fmt(e.amount)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {roll.bids.length > 0 && (
            <section>
              <h3 className="section-label">
                <FileText size={14} aria-hidden /> Bids ({roll.bids.length})
              </h3>
              <ul className="plain-list">
                {roll.bids.slice(0, 6).map((b) => (
                  <li key={b.id} className="kv-row">
                    <span>{b.awardedAt ? 'Awarded bid' : 'Bid'}</span>
                    <strong className="tnum">{fmt(b.amount)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {roll.tasks.length > 0 && (
            <section>
              <h3 className="section-label">
                <ClipboardList size={14} aria-hidden /> Tasks ({roll.tasks.length})
              </h3>
              <ul className="plain-list">
                {roll.tasks.slice(0, 6).map((t) => (
                  <li key={t.id} className="kv-row">
                    <span>{t.title}</span>
                    <span className="muted">{t.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {nothing && <p className="muted">No linked expenses, bids, or tasks yet.</p>}

          <Button variant="secondary" fullWidth leadingIcon={<Pencil size={16} />} onClick={() => onEdit(vendor)}>
            Edit contact details
          </Button>
        </div>
      )}
    </Sheet>
  )
}
