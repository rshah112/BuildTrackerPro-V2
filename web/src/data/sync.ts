// Auth-gated offline replay. Every operation is loaded from the current user's own
// outbox, affected rows are verified, transient HTTP failures stay pending, and server
// rejections remain persisted as needs-attention items.

import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { toSnake } from '../lib/casing'
import {
  bindOutboxUser,
  flush,
  outboxUserId,
  resetOutboxMemory,
  type ApplyResult,
  type OutboxOp,
} from '../lib/outbox'
import { idbClear } from '../lib/idbKv'
import { isOnline, isRetryablePostgrestError, onReconnect } from '../lib/netStatus'
import { queryClient } from '../lib/queryClient'
import { bindReadCacheUser } from './readCache'

const ALLOWED_TABLES = new Set([
  'projects',
  'budget_categories',
  'budget_line_items',
  'expenses',
  'vendors',
  'change_orders',
  'photo_attachments',
  'project_documents',
  'project_tasks',
  'bid_packages',
  'bids',
  'allowance_selections',
  'construction_loans',
  'loan_draws',
  'phases',
  'lien_waivers',
  'push_subscriptions',
  'notification_prefs',
  'backup_catalog',
])

type DbError = { code?: string; message?: string; status?: number; statusCode?: number }

function errorMessage(error: unknown, fallback: string): string {
  const candidate = error as DbError | null
  const prefix = candidate?.code ? `${candidate.code}: ` : ''
  return `${prefix}${candidate?.message || fallback}`.slice(0, 300)
}

export function classifyDbResult(
  error: unknown,
  status: unknown,
  options?: { create?: boolean; createIdExists?: boolean; affected?: number; missingIsAlready?: boolean },
): ApplyResult {
  const candidate = error as DbError | null
  if (options?.create && options.createIdExists && candidate?.code === '23505') return 'already'
  if (isRetryablePostgrestError(error, status)) {
    return { status: 'retry', message: errorMessage(error, 'Temporary server failure. The app will retry.') }
  }
  if (error) {
    return { status: 'rejected', message: errorMessage(error, 'The server rejected this change.') }
  }
  if (options?.affected !== undefined && options.affected === 0) {
    if (options.missingIsAlready) return 'already'
    return {
      status: 'rejected',
      message: 'No row was changed. It may have been removed elsewhere or access was denied.',
    }
  }
  return 'done'
}

/** Upgrade boundary for durable operations created by older app builds. Line-item
 * `actual` is database-derived as of migration 0017, and row identity/ownership metadata
 * must never be replayed as editable data. Keep the stable id on creates for idempotency. */
export function sanitizeReplayPayload(
  table: string,
  kind: 'create' | 'update',
  payload: Record<string, unknown> = {},
): Record<string, unknown> {
  const next = { ...payload }
  if (table !== 'budget_line_items') return next
  for (const key of ['actual', 'owner', 'createdAt', 'created_at', 'deletedAt', 'deleted_at']) delete next[key]
  if (kind === 'update') delete next.id
  return next
}

export async function applyOp(op: OutboxOp, currentUserId: string): Promise<ApplyResult> {
  if (op.userId !== currentUserId) {
    return { status: 'rejected', message: 'This change belongs to a different account and was not replayed.' }
  }
  if (!ALLOWED_TABLES.has(op.table)) {
    return { status: 'rejected', message: `Unknown data collection: ${op.table}` }
  }

  const tbl = supabase.from(op.table)
  switch (op.kind) {
    case 'create': {
      const payload = sanitizeReplayPayload(op.table, 'create', op.payload)
      const { error, status } = await tbl.insert(toSnake(payload) as never).select('id')
      const candidate = error as DbError | null
      if (candidate?.code !== '23505' || !op.id) {
        return classifyDbResult(error, status, { create: true })
      }

      // A uniqueness failure may come from any unique constraint (for example, a
      // duplicate vendor name). It is idempotent only when this queued create's
      // client-generated primary key is already present and visible to the owner.
      const {
        data: existing,
        error: lookupError,
        status: lookupStatus,
      } = await tbl.select('id').eq('id', op.id).maybeSingle()
      if (lookupError) return classifyDbResult(lookupError, lookupStatus)
      return classifyDbResult(error, status, {
        create: true,
        createIdExists: (existing as { id?: unknown } | null)?.id === op.id,
      })
    }
    case 'update': {
      const payload = sanitizeReplayPayload(op.table, 'update', op.payload)
      const { data, error, status } = await tbl
        .update(toSnake(payload) as never)
        .eq('id', op.id)
        .select('id')
      return classifyDbResult(error, status, { affected: data?.length ?? 0 })
    }
    case 'remove': {
      const { data, error, status } = await tbl
        .update({ deleted_at: new Date().toISOString() } as never)
        .eq('id', op.id)
        .select('id')
      return classifyDbResult(error, status, { affected: data?.length ?? 0 })
    }
    case 'restore': {
      const { data, error, status } = await tbl
        .update({ deleted_at: null } as never)
        .eq('id', op.id)
        .select('id')
      return classifyDbResult(error, status, { affected: data?.length ?? 0 })
    }
    case 'purge': {
      const { data, error, status } = await tbl.delete().eq('id', op.id).select('id')
      return classifyDbResult(error, status, { affected: data?.length ?? 0, missingIsAlready: true })
    }
    default:
      return { status: 'rejected', message: 'Unknown offline operation.' }
  }
}

async function bindSession(session: Session | null): Promise<void> {
  const userId = session?.user.id ?? null
  if (outboxUserId() !== userId) queryClient.clear()
  bindReadCacheUser(userId)
  try {
    await bindOutboxUser(userId)
  } catch {
    // Online use can continue without IndexedDB. A later offline mutation still fails
    // visibly because enqueue cannot confirm durability.
  }
}

/** Replay only after a local authenticated session is present and bound to this outbox. */
export async function flushOutbox(): Promise<void> {
  const { data, error } = await supabase.auth.getSession()
  const session = error ? null : data.session
  if (!session) return
  try {
    await bindSession(session)
    const userId = session.user.id
    const { flushed } = await flush((op) => applyOp(op, userId))
    if (flushed > 0) await queryClient.invalidateQueries()
  } catch {
    // The queue stays durable and will be retried by the next reconnect/visibility event.
  }
}

async function clearSensitiveCaches(): Promise<void> {
  if (typeof caches === 'undefined') return
  const names = await caches.keys()
  await Promise.all(names.filter((name) => name === 'r2-media' || name.startsWith('r2-media-')).map((name) => caches.delete(name)))
}

/** Shared by explicit logout and cross-tab SIGNED_OUT events. */
export async function clearSensitiveClientState(): Promise<void> {
  resetOutboxMemory()
  bindReadCacheUser(null)
  queryClient.clear()
  await Promise.allSettled([idbClear(), clearSensitiveCaches()])
}

let initialized = false

/** Wire sync once. Auth callbacks defer work to avoid awaiting Supabase calls inside
 * onAuthStateChange, which can deadlock the auth client's internal lock. */
export function initSync(): void {
  if (initialized) return
  initialized = true

  void supabase.auth.getSession().then(async ({ data }) => {
    await bindSession(data.session)
    if (data.session && isOnline()) await flushOutbox()
  })

  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (event === 'SIGNED_OUT') void clearSensitiveClientState()
      else {
        void bindSession(session).then(() => {
          if (session && isOnline()) void flushOutbox()
        })
      }
    }, 0)
  })

  onReconnect(() => void flushOutbox())
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isOnline()) void flushOutbox()
    })
  }
}
