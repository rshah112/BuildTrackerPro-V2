// Drives the offline outbox: replays queued mutations against Supabase and reconciles the cache.
// applyOp() translates each queued op back into the same Supabase call the table layer makes, and
// classifies the outcome for the outbox engine (a thrown fetch error → retry/keep; a unique-key
// conflict on a create replay → 'already', i.e. a lost ack, never a duplicate; any other DB error
// → 'fatal' so a permanently-rejected op can't block the queue forever).

import { supabase } from '../lib/supabase'
import { toSnake } from '../lib/casing'
import { flush, hydrateOutbox, type ApplyResult, type OutboxOp } from '../lib/outbox'
import { isOnline, onReconnect } from '../lib/netStatus'
import { queryClient } from '../lib/queryClient'

async function applyOp(op: OutboxOp): Promise<ApplyResult> {
  const tbl = supabase.from(op.table)
  switch (op.kind) {
    case 'create': {
      const { error } = await tbl.insert(toSnake(op.payload ?? {}) as never)
      if (!error) return 'done'
      if ((error as { code?: string }).code === '23505') return 'already' // already inserted (lost ack)
      return 'fatal'
    }
    case 'update': {
      const { error } = await tbl.update(toSnake(op.payload ?? {}) as never).eq('id', op.id)
      return error ? 'fatal' : 'done'
    }
    case 'remove': {
      const { error } = await tbl.update({ deleted_at: new Date().toISOString() } as never).eq('id', op.id)
      return error ? 'fatal' : 'done'
    }
    case 'restore': {
      const { error } = await tbl.update({ deleted_at: null } as never).eq('id', op.id)
      return error ? 'fatal' : 'done'
    }
    case 'purge': {
      const { error } = await tbl.delete().eq('id', op.id)
      return error ? 'fatal' : 'done'
    }
    default:
      return 'fatal'
  }
}

/** Replay the queue; if anything landed, refetch so the UI reflects server truth. */
export async function flushOutbox(): Promise<void> {
  const { flushed } = await flush(applyOp)
  if (flushed > 0) await queryClient.invalidateQueries()
}

/** Wire up the outbox at app start: hydrate from disk, drain when online, and on reconnect /
 *  tab-visible. Call once from the app entry. */
export function initSync(): void {
  void hydrateOutbox().then(() => {
    if (isOnline()) void flushOutbox()
  })
  onReconnect(() => void flushOutbox())
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && isOnline()) void flushOutbox()
    })
  }
}
