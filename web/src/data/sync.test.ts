import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OutboxOp } from '../lib/outbox'

const h = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  insertSelect: vi.fn(),
  lookupSelect: vi.fn(),
  lookupEq: vi.fn(),
  lookupMaybeSingle: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: { from: h.from } }))

import { applyOp, classifyDbResult, sanitizeReplayPayload } from './sync'

const createOp = (): OutboxOp => ({
  opId: 'op-1',
  userId: 'user-1',
  table: 'vendors',
  kind: 'create',
  id: 'vendor-1',
  payload: { id: 'vendor-1', projectId: 'project-1', name: 'Acme' },
  createdAt: 1,
  tries: 0,
  state: 'pending',
})

beforeEach(() => {
  vi.clearAllMocks()
  h.insert.mockReturnValue({ select: h.insertSelect })
  h.lookupSelect.mockReturnValue({ eq: h.lookupEq })
  h.lookupEq.mockReturnValue({ maybeSingle: h.lookupMaybeSingle })
  h.from.mockReturnValue({ insert: h.insert, select: h.lookupSelect })
})

describe('offline replay result classification', () => {
  it.each([0, 408, 429, 500, 503])('keeps HTTP %s queued for retry', (status) => {
    expect(classifyDbResult(null, status)).toMatchObject({ status: 'retry' })
    expect(classifyDbResult({ message: 'temporary' }, status)).toMatchObject({ status: 'retry' })
  })

  it('retains permanent server rejections for attention', () => {
    expect(classifyDbResult({ code: '42501', message: 'RLS denied' }, 403)).toEqual({
      status: 'rejected',
      message: '42501: RLS denied',
    })
  })

  it('accepts only confirmed idempotent create conflicts and already-missing purges', () => {
    expect(classifyDbResult({ code: '23505' }, 409, { create: true, createIdExists: true })).toBe('already')
    expect(classifyDbResult({ code: '23505' }, 409, { create: true })).toMatchObject({ status: 'rejected' })
    expect(classifyDbResult(null, 200, { affected: 0, missingIsAlready: true })).toBe('already')
  })

  it('rejects an update that silently affected no rows', () => {
    expect(classifyDbResult(null, 200, { affected: 0 })).toMatchObject({ status: 'rejected' })
  })
})

describe('offline create conflict verification', () => {
  it('removes a duplicate create only after its queued primary key is found', async () => {
    h.insertSelect.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' }, status: 409 })
    h.lookupMaybeSingle.mockResolvedValue({ data: { id: 'vendor-1' }, error: null, status: 200 })

    await expect(applyOp(createOp(), 'user-1')).resolves.toBe('already')
    expect(h.lookupEq).toHaveBeenCalledWith('id', 'vendor-1')
  })

  it('retains a conflict on another unique constraint when the queued id is absent', async () => {
    h.insertSelect.mockResolvedValue({
      error: { code: '23505', message: 'duplicate vendor name' },
      status: 409,
    })
    h.lookupMaybeSingle.mockResolvedValue({ data: null, error: null, status: 200 })

    await expect(applyOp(createOp(), 'user-1')).resolves.toEqual({
      status: 'rejected',
      message: '23505: duplicate vendor name',
    })
  })

  it('retries when the primary-key verification is temporarily unavailable', async () => {
    h.insertSelect.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' }, status: 409 })
    h.lookupMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'gateway timeout' },
      status: 503,
    })

    await expect(applyOp(createOp(), 'user-1')).resolves.toMatchObject({ status: 'retry' })
  })
})

describe('offline replay upgrade sanitation', () => {
  it('drops stale derived and immutable fields from a legacy line-item update', () => {
    const legacy = {
      id: 'line-1',
      owner: 'user-1',
      createdAt: '2025-01-01',
      deleted_at: null,
      actual: 999,
      title: 'Updated title',
      budget: 2500,
    }

    expect(sanitizeReplayPayload('budget_line_items', 'update', legacy)).toEqual({
      title: 'Updated title',
      budget: 2500,
    })
    expect(legacy.actual).toBe(999)
  })

  it('keeps a client-generated create id while dropping its client-derived actual', () => {
    expect(
      sanitizeReplayPayload('budget_line_items', 'create', {
        id: 'line-1',
        actual: 50,
        title: 'Offline line',
      }),
    ).toEqual({ id: 'line-1', title: 'Offline line' })
  })

  it('does not reshape unrelated table payloads', () => {
    expect(sanitizeReplayPayload('expenses', 'update', { id: 'expense-1', amount: 25 })).toEqual({
      id: 'expense-1',
      amount: 25,
    })
  })
})
