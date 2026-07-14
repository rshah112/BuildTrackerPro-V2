import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { flushOutbox, clearSensitiveClientState } from '../../data/sync'
import { unresolvedCount } from '../../lib/outbox'
import { isOnline } from '../../lib/netStatus'
import { unsubscribeFromPush } from '../../lib/push'

/** Tracks the current Supabase auth session, updating on sign-in/out. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { session, loading }
}

function clearAccountLocalStorage(): void {
  if (typeof localStorage === 'undefined') return
  const deviceOnlyKeys = new Set(['btp.theme', 'btp.chunkReloaded', 'btp.notifyPromptDismissed'])
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index)
      if (key?.startsWith('btp.') && !deviceOnlyKeys.has(key)) localStorage.removeItem(key)
    }
  } catch {
    // Storage may be disabled. Auth logout and the account-scoped caches still protect
    // the next session from seeing this account's in-memory data.
  }
}

function warn(message: string): void {
  if (typeof window !== 'undefined') window.alert(message)
}

/** Sign out without silently abandoning offline financial changes. Returns false when
 * the user cancels or Supabase cannot end the session. */
export async function signOut(): Promise<boolean> {
  if (isOnline()) {
    try {
      await flushOutbox()
    } catch {
      // The durable queue remains authoritative and is handled by the confirmation below.
    }
  }

  const unresolved = unresolvedCount()
  if (unresolved > 0) {
    const confirmed =
      typeof window !== 'undefined' &&
      window.confirm(
        `${unresolved} change${unresolved === 1 ? '' : 's'} have not synced. ` +
          'Signing out will discard them from this device. Discard and sign out?',
      )
    if (!confirmed) return false
  }

  // This must run before auth.signOut(): the server-side endpoint delete is owner-scoped.
  await unsubscribeFromPush()

  try {
    const { error } = await supabase.auth.signOut()
    if (error) {
      // An offline device must still be able to remove its local session and cached data.
      const localResult = await supabase.auth.signOut({ scope: 'local' })
      if (localResult.error) throw localResult.error
    }
  } catch {
    warn('Could not sign out. Check your connection and try again.')
    return false
  }

  clearAccountLocalStorage()
  // This is the actual discard point. If auth logout fails above, the user's durable
  // operations remain intact despite having confirmed the proposed sign-out.
  await clearSensitiveClientState()
  return true
}
