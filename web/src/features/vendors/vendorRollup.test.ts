import { describe, it, expect } from 'vitest'
import type { Bid, Expense, ProjectTask, Vendor } from '../../domain/types'
import { vendorRollup } from './vendorRollup'

const vendor = { id: 'v1', name: 'Smith Plumbing' } as Vendor
const E = (o: Partial<Expense>) =>
  ({ id: 'e', vendorName: '', amount: 0, amountPaid: 0, isPaid: false, ...o }) as Expense
const B = (o: Partial<Bid>) => ({ id: 'b', vendorId: null, vendorName: '', amount: 0, awardedAt: null, ...o }) as Bid
const T = (o: Partial<ProjectTask>) => ({ id: 't', vendorId: null, title: '', status: 'todo', ...o }) as ProjectTask

describe('vendorRollup', () => {
  it('rolls up expenses by name (case-insensitive) and bids/tasks by id', () => {
    const r = vendorRollup(
      vendor,
      [
        E({ id: 'e1', vendorName: 'smith plumbing', amount: 1000, amountPaid: 400, isPaid: true }),
        E({ id: 'e2', vendorName: 'Other Co', amount: 500 }),
      ],
      [B({ id: 'b1', vendorId: 'v1', amount: 900 }), B({ id: 'b2', vendorName: 'Smith Plumbing', amount: 50 }), B({ id: 'b3', vendorId: 'x', amount: 1 })],
      [T({ id: 't1', vendorId: 'v1', title: 'Fix leak' }), T({ id: 't2', vendorId: 'z' })],
    )
    expect(r.invoiced).toBe(1000) // only the matched expense
    expect(r.paid).toBe(400)
    expect(r.open).toBe(600)
    expect(r.expenses.map((e) => e.id)).toEqual(['e1'])
    expect(r.bids.map((b) => b.id).sort()).toEqual(['b1', 'b2']) // by id + by name, not the 'x' one
    expect(r.tasks.map((t) => t.id)).toEqual(['t1'])
  })

  it('returns zeros when nothing is linked', () => {
    const r = vendorRollup(vendor, [E({ vendorName: 'Nobody' })], [], [])
    expect(r.invoiced).toBe(0)
    expect(r.expenses).toHaveLength(0)
    expect(r.bids).toHaveLength(0)
    expect(r.tasks).toHaveLength(0)
  })
})
