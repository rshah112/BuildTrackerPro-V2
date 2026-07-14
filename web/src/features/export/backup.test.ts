import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_VERSION, backupItemCount, parseBackup, prepareRestore, restoreBackup } from './backup'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: rpcMock },
}))

const sections = {
  categories: [],
  lineItems: [],
  expenses: [],
  changeOrders: [],
  allowanceSelections: [],
  vendors: [],
  tasks: [],
  bidPackages: [],
  bids: [],
  photos: [],
  documents: [],
  loans: [],
  loanDraws: [],
  phases: [],
  lienWaivers: [],
}

function backup(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    backupVersion: BACKUP_VERSION,
    project: { id: 'project-1', name: 'My build' },
    exportedAt: '2026-07-13T12:00:00.000Z',
    ...sections,
    ...overrides,
  })
}

describe('backup format validation', () => {
  beforeEach(() => {
    rpcMock.mockReset()
    vi.stubGlobal('navigator', { onLine: true })
  })

  it('accepts a complete current backup and counts every entity section', () => {
    const parsed = parseBackup(
      backup({ expenses: [{ id: 'e1' }], lienWaivers: [{ id: 'w1' }], tasks: [{ id: 't1' }] }),
    )
    expect(parsed.project.name).toBe('My build')
    expect(backupItemCount(parsed)).toBe(3)
  })

  it('keeps version 1 backups compatible by adding the newer lien-waiver section', () => {
    const legacy = { ...sections } as Record<string, unknown>
    delete legacy.lienWaivers
    const parsed = parseBackup(backup({ ...legacy, backupVersion: 1, lienWaivers: undefined }))
    expect(parsed.lienWaivers).toEqual([])
  })

  it('rejects unsupported versions before restore can write anything', () => {
    expect(() => parseBackup(backup({ backupVersion: 99 }))).toThrow(/not supported/)
  })

  it('rejects malformed entity collections', () => {
    expect(() => parseBackup(backup({ expenses: { id: 'not-an-array' } }))).toThrow(/expenses/)
    expect(() => parseBackup(backup({ expenses: [null] }))).toThrow(/invalid rows/)
  })

  it('remaps every internal relationship and clears derived actuals before the RPC', () => {
    const parsed = parseBackup(backup({
      lineItems: [{ id: 'line-1', actual: 999 }],
      vendors: [{ id: 'vendor-1' }],
      changeOrders: [{ id: 'change-1', budgetLineItemId: 'line-1' }],
      expenses: [{
        id: 'expense-1',
        budgetLineItemId: 'line-1',
        vendorId: 'vendor-1',
        changeOrderId: 'change-1',
      }],
      photos: [{ id: 'photo-1', budgetLineItemId: 'line-1' }],
      tasks: [{
        id: 'task-1',
        vendorId: 'vendor-1',
        budgetLineItemId: 'line-1',
        photoIds: ['photo-1', 'missing-photo'],
      }],
      bidPackages: [{ id: 'package-1', awardedBidId: 'bid-1' }],
      bids: [{ id: 'bid-1', packageId: 'package-1', vendorId: 'vendor-1' }],
      allowanceSelections: [{ id: 'selection-1', lineItemId: 'line-1' }],
      loans: [{ id: 'loan-1' }],
      loanDraws: [{ id: 'draw-1', loanId: 'loan-1' }],
      lienWaivers: [{ id: 'waiver-1', expenseId: 'expense-1' }],
    }))

    const prepared = prepareRestore(parsed)
    const lineId = prepared.lineItems[0].id
    const vendorId = prepared.vendors[0].id
    const expenseId = prepared.expenses[0].id

    expect(lineId).not.toBe('line-1')
    expect(prepared.lineItems[0].actual).toBe(0)
    expect(prepared.expenses[0]).toMatchObject({
      budgetLineItemId: lineId,
      vendorId,
      changeOrderId: prepared.changeOrders[0].id,
    })
    expect(prepared.bidPackages[0].awardedBidId).toBe(prepared.bids[0].id)
    expect(prepared.bids[0]).toMatchObject({ packageId: prepared.bidPackages[0].id, vendorId })
    expect(prepared.tasks[0].photoIds).toEqual([prepared.photos[0].id])
    expect(prepared.allowanceSelections[0].lineItemId).toBe(lineId)
    expect(prepared.loanDraws[0].loanId).toBe(prepared.loans[0].id)
    expect(prepared.lienWaivers[0].expenseId).toBe(expenseId)
    expect(new Set(prepared.expenses.map((row) => row.projectId))).toEqual(new Set([prepared.project.id]))
  })

  it('rejects duplicate ids and dangling required references before making an RPC', () => {
    expect(() => prepareRestore(parseBackup(backup({
      vendors: [{ id: 'same' }, { id: 'same' }],
    })))).toThrow(/duplicate ids/)

    expect(() => prepareRestore(parseBackup(backup({
      allowanceSelections: [{ id: 'selection-1', lineItemId: 'missing' }],
    })))).toThrow(/selection line item/)
    expect(rpcMock).not.toHaveBeenCalled()
  })

  it('restores through exactly one server RPC and returns its committed project id', async () => {
    const restoredId = '10000000-0000-0000-0000-000000000001'
    rpcMock.mockResolvedValue({ data: restoredId, error: null, status: 200 })

    await expect(restoreBackup(backup())).resolves.toBe(restoredId)
    expect(rpcMock).toHaveBeenCalledTimes(1)
    expect(rpcMock).toHaveBeenCalledWith('restore_project_backup', {
      payload: expect.objectContaining({ backup_version: BACKUP_VERSION }),
    })
  })

  it('reports a rejected transaction as rolled back', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'invalid restored relationship' },
      status: 400,
    })

    await expect(restoreBackup(backup())).rejects.toThrow(/Restore was rolled back/)
  })
})
