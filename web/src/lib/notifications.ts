// Web notification capability + permission helpers. Phase 1 is local-only: we ask
// permission and show notifications from the page via the service-worker registration
// (works while the app/SW is alive — e.g. on open or in the background tab). True
// server-pushed reminders to a fully-closed app are Phase 2 (VAPID + Edge Function).
// Everything here is feature-detected and degrades to a no-op on unsupported browsers
// (notably iOS Safari unless the PWA is installed).

export type NotifState = 'unsupported' | 'default' | 'granted' | 'denied'

const DISMISS_KEY = 'btp.notifyPromptDismissed'
const ICON = '/icons/icon-192.png'

export function notifSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    typeof Notification.requestPermission === 'function'
  )
}

export function notifState(): NotifState {
  if (!notifSupported()) return 'unsupported'
  return Notification.permission as NotifState
}

export function promptDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function dismissPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1')
  } catch {
    /* ignore */
  }
}

/** Surface the one-time enable prompt only when the browser can do it, the user hasn't
 *  decided yet, and they haven't dismissed our ask before. ("Only if not enabled.") */
export function shouldOfferPrompt(): boolean {
  return notifSupported() && notifState() === 'default' && !promptDismissed()
}

/** Ask the OS permission. Returns the resulting state. */
export async function enableNotifications(): Promise<NotifState> {
  if (!notifSupported()) return 'unsupported'
  try {
    const perm = await Notification.requestPermission()
    return perm as NotifState
  } catch {
    return notifState()
  }
}

/** Show a notification through the active SW registration (so it survives the page and
 *  routes on click via the SW's notificationclick handler). No-ops unless granted. */
export async function showLocalNotification(
  title: string,
  opts: NotificationOptions & { url?: string } = {},
): Promise<boolean> {
  if (notifState() !== 'granted' || !('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    const { url, data, ...rest } = opts
    await reg.showNotification(title, {
      icon: ICON,
      badge: ICON,
      data: { url: url ?? '/', ...(data as object) },
      ...rest,
    })
    return true
  } catch {
    return false
  }
}

/** App-icon badge (count of items needing attention). Feature-detected; silent no-op
 *  where unsupported. Pass 0 to clear. */
export function setBadge(count: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (count > 0) void nav.setAppBadge?.(count)
    else void nav.clearAppBadge?.()
  } catch {
    /* ignore */
  }
}
