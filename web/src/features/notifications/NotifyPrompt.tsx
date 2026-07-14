import { useEffect, useState } from 'react'
import { Bell, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/Toast'
import {
  shouldOfferPrompt,
  enableNotifications,
  dismissPrompt,
  showLocalNotification,
  type NotifState,
} from '../../lib/notifications'
import { subscribeToPush } from '../../lib/push'

/** One-time, non-blocking banner inviting the user to turn on reminders — shown ONLY when
 *  the browser supports notifications, permission is still 'default', and they haven't
 *  dismissed it before. Surfaces a few seconds after load so it never interrupts first
 *  paint. Reachable again later from More → Notifications. */
export function NotifyPrompt({ onChange }: { onChange: (s: NotifState) => void }) {
  const toast = useToast()
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!shouldOfferPrompt()) return
    const t = setTimeout(() => setShow(true), 4000)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  const enable = async () => {
    setBusy(true)
    const state = await enableNotifications()
    setBusy(false)
    setShow(false)
    onChange(state)
    if (state === 'granted') {
      void subscribeToPush() // register this device for background push (best-effort)
      toast.success('Reminders on — we’ll flag invoices coming due.')
      void showLocalNotification('Reminders are on', {
        body: 'HomeBuild Pro will flag invoices and change-order payments coming due.',
        url: '/cashflow',
        tag: 'notify-welcome',
      })
    } else if (state === 'denied') {
      toast.error('Notifications were blocked. You can re-enable them in your browser settings.')
    }
  }

  const notNow = () => {
    dismissPrompt()
    setShow(false)
  }

  return (
    <div className="notify-banner" role="dialog" aria-label="Enable reminders">
      <span className="notify-banner-icon" aria-hidden>
        <Bell size={20} />
      </span>
      <div className="notify-banner-text">
        <strong>Turn on payment reminders?</strong>
        <span className="muted">Get a heads-up when invoices and change orders are coming due.</span>
      </div>
      <div className="notify-banner-actions">
        <Button size="sm" loading={busy} onClick={enable}>
          Enable
        </Button>
        <button className="notify-banner-dismiss" onClick={notNow} aria-label="Not now">
          <X size={18} aria-hidden />
        </button>
      </div>
    </div>
  )
}
