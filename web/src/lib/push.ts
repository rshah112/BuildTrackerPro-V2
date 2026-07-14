import { supabase } from './supabase'
import { notifState } from './notifications'

// Web Push subscription (Phase 2). The VAPID PUBLIC key is safe to ship (it only lets the
// browser target our push server); the PRIVATE key lives only in Vercel env, used by the
// reminder cron. A baked public fallback keeps existing subscribed installs compatible.
const PROD_VAPID_PUBLIC = 'BDk300BdpTcg4CxGWlYuY3aHy0p78M5kPVQXNFPTRPIXbnbnEVz3kacNa4xGQ2l9ncTE2aJvZIgYZSxAoSr4HUQ'
const VAPID_PUBLIC =
  import.meta.env.VITE_VAPID_PUBLIC_KEY || (import.meta.env.PROD ? PROD_VAPID_PUBLIC : '')

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && !!VAPID_PUBLIC
}

/** Subscribe this device to Web Push and persist the subscription (RLS owner-scoped).
 *  Idempotent — reuses an existing subscription. Best-effort: returns false on any failure
 *  (e.g. permission not granted, unsupported browser, network). */
export async function subscribeToPush(): Promise<boolean> {
  if (!pushSupported() || notifState() !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      }))
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_agent: navigator.userAgent.slice(0, 300),
      } as never,
      { onConflict: 'endpoint' },
    )
    return !error
  } catch {
    return false
  }
}

/** Remove this browser's push endpoint while the current auth session can still
 * satisfy RLS, then unsubscribe locally so a signed-out device cannot receive reminders. */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return true
  try {
    const registration = await navigator.serviceWorker.getRegistration()
    const subscription = await registration?.pushManager.getSubscription()
    if (!subscription) return true

    const endpoint = subscription.endpoint
    let serverDeleted = false
    try {
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
      serverDeleted = !error
    } catch {
      // Still unsubscribe the browser below; the push service will subsequently report
      // the stale server endpoint as gone and the reminder job removes dead endpoints.
    }
    const unsubscribed = await subscription.unsubscribe()
    return serverDeleted && unsubscribed
  } catch {
    return false
  }
}
