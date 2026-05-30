import { useState } from 'react'
import { ChevronDown, Plus, Pencil, Trash2, Award, FileStack } from 'lucide-react'
import type { Bid, BidPackage } from '../../domain/types'
import type { BidPackageStatus } from '../../domain/enums'
import { fmt } from '../../lib/money'
import { ScreenHeader } from '../../app/ScreenHeader'
import { Button } from '../../components/ui/Button'
import { Badge, type BadgeTone } from '../../components/ui/Badge'
import { Sheet } from '../../components/ui/Sheet'
import { EmptyState } from '../../components/ui/Feedback'
import { useToast } from '../../components/ui/Toast'
import { useCurrentProject } from '../projects/currentProject'
import { useVendors } from '../vendors/useVendors'
import {
  useBidPackages,
  useUpdateBidPackage,
  useRemoveBidPackage,
  useBids,
  useUpdateBid,
  useRemoveBid,
} from './useBids'
import { BidPackageForm } from './BidPackageForm'
import { BidForm } from './BidForm'

const PKG_TONE: Record<BidPackageStatus, BadgeTone> = { open: 'info', awarded: 'success', passed: 'neutral' }

export function BidsScreen() {
  const { projectId } = useCurrentProject()
  const { data: packages = [], isLoading, error } = useBidPackages(projectId!)
  const { data: bids = [] } = useBids(projectId!)
  const { data: vendors = [] } = useVendors(projectId!)
  const updatePackage = useUpdateBidPackage()
  const removePackage = useRemoveBidPackage()
  const updateBid = useUpdateBid()
  const removeBid = useRemoveBid()
  const toast = useToast()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [pkgEditing, setPkgEditing] = useState<BidPackage | 'new' | null>(null)
  const [bidEditing, setBidEditing] = useState<{ packageId: string; bid?: Bid } | null>(null)

  if (!projectId) return null

  const bidsFor = (pkgId: string) => bids.filter((b) => b.packageId === pkgId)
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const award = async (pkg: BidPackage, bid: Bid) => {
    await updatePackage.mutateAsync({ id: pkg.id, patch: { status: 'awarded', awardedBidId: bid.id } })
    await updateBid.mutateAsync({ id: bid.id, patch: { awardedAt: new Date().toISOString() } })
    toast.success(`Awarded to ${bid.vendorName || 'vendor'}`)
  }

  return (
    <section>
      <ScreenHeader
        title="Bids"
        trailing={
          packages.length > 0 ? (
            <Button size="sm" leadingIcon={<Plus size={16} />} onClick={() => setPkgEditing('new')}>
              Add package
            </Button>
          ) : undefined
        }
      />

      {error && <p role="alert">Couldn’t load bids: {(error as Error).message}</p>}
      {isLoading && <div className="loading">Loading bids…</div>}

      {!isLoading && packages.length === 0 ? (
        <EmptyState
          icon={FileStack}
          title="No bid packages yet"
          body="Create a bid package for a scope of work, collect bids, and award the winner."
          action={
            <Button leadingIcon={<Plus size={16} />} onClick={() => setPkgEditing('new')}>
              Add package
            </Button>
          }
        />
      ) : (
        <ul className="card-list">
          {packages.map((pkg) => {
            const pkgBids = bidsFor(pkg.id)
            const low = pkgBids.length ? Math.min(...pkgBids.map((b) => b.amount)) : 0
            const open = expanded.has(pkg.id)
            return (
              <li key={pkg.id} className="budget-cat">
                <button className="budget-cat-head" onClick={() => toggle(pkg.id)} aria-expanded={open}>
                  <ChevronDown className={`budget-cat-caret${open ? ' is-open' : ''}`} size={18} aria-hidden />
                  <div className="budget-cat-info">
                    <div className="budget-cat-titlerow">
                      <strong>{pkg.scopeTitle}</strong>
                      <Badge tone={PKG_TONE[pkg.status]}>{pkg.status}</Badge>
                    </div>
                    <div className="budget-cat-figures muted">
                      {pkgBids.length} {pkgBids.length === 1 ? 'bid' : 'bids'}
                      {pkgBids.length > 0 ? ` · low ${fmt(low)}` : ''}
                      {pkg.dueDate ? ` · due ${new Date(pkg.dueDate).toLocaleDateString()}` : ''}
                    </div>
                  </div>
                </button>

                <div className="budget-cat-actions">
                  <Button size="sm" variant="ghost" leadingIcon={<Pencil size={14} />} onClick={() => setPkgEditing(pkg)}>
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Plus size={14} />}
                    onClick={() => setBidEditing({ packageId: pkg.id })}
                  >
                    Add bid
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    leadingIcon={<Trash2 size={14} />}
                    onClick={() => removePackage.mutate(pkg.id)}
                  >
                    Delete
                  </Button>
                </div>

                {open && (
                  <ul className="lineitem-list">
                    {pkgBids.length === 0 && <li className="muted lineitem-empty">No bids yet.</li>}
                    {pkgBids.map((b) => {
                      const awarded = pkg.awardedBidId === b.id
                      return (
                        <li key={b.id} className="lineitem">
                          <div className="lineitem-row">
                            <div className="lineitem-title">
                              <strong>{b.vendorName || 'Vendor'}</strong>
                              {awarded && (
                                <Badge tone="success" className="bid-awarded">
                                  Awarded
                                </Badge>
                              )}
                            </div>
                            <strong>{fmt(b.amount)}</strong>
                          </div>
                          <div className="lineitem-foot">
                            <span className="lineitem-acts">
                              {awarded ? (
                                <Button size="sm" variant="ghost" onClick={() => unaward(pkg, b)}>
                                  Unaward
                                </Button>
                              ) : (
                                <Button size="sm" variant="ghost" leadingIcon={<Award size={14} />} onClick={() => award(pkg, b)}>
                                  Award
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => setBidEditing({ packageId: pkg.id, bid: b })}>
                                Edit
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => removeBid.mutate(b.id)}>
                                Delete
                              </Button>
                            </span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <Sheet
        open={pkgEditing !== null}
        onClose={() => setPkgEditing(null)}
        title={pkgEditing === 'new' ? 'New bid package' : 'Edit bid package'}
      >
        {pkgEditing !== null && (
          <BidPackageForm
            projectId={projectId}
            initial={pkgEditing === 'new' ? undefined : pkgEditing}
            onDone={() => setPkgEditing(null)}
          />
        )}
      </Sheet>

      <Sheet
        open={bidEditing !== null}
        onClose={() => setBidEditing(null)}
        title={bidEditing?.bid ? 'Edit bid' : 'New bid'}
      >
        {bidEditing !== null && (
          <BidForm
            projectId={projectId}
            packageId={bidEditing.packageId}
            vendors={vendors}
            initial={bidEditing.bid}
            onDone={() => setBidEditing(null)}
          />
        )}
      </Sheet>
    </section>
  )
}
