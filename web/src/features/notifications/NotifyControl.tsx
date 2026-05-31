import { useState } from 'react'
import { Bell, BellOff, BellRing } from 'lucide-react'
import { useToast } from '../../components/ui/Toast'
import { notifState, enableNotifications, showLocalNotification } from '../../lib/notifications'

/** A More-screen row to enable reminders (or see their status) — the durable entry point
 *  after the one-time banner is dismissed. Hidden entirely on browsers that can't notify. */
export function NotifyControl() {
  const toast = useToast()
  const [state, setState] = useState(notifState())

  if (state === 'unsupported') return null

  if (state === 'granted') {
    return (
      <div className="list-row" aria-disabled>
        <BellRing className="list-row-icon" size={20} aria-hidden />
        <span className="list-row-label">Reminders on</span>
        <span className="list-row-trail muted">On</span>
      </div>
    )
  }

  if (state === 'denied') {
    return (
      <div className="list-row" aria-disabled>
        <BellOff className="list-row-icon" size={20} aria-hidden />
        <span className="list-row-label">Reminders blocked</span>
        <span className="list-row-trail muted">In browser settings</span>
      </div>
    )
  }

  const enable = async () => {
    const next = await enableNotifications()
    setState(next)
    if (next === 'granted') {
      toast.success('Reminders on')
      void showLocalNotification('Reminders are on', {
        body: 'BuildTracker will flag invoices and change-order payments coming due.',
        url: '/cashflow',
        tag: 'notify-welcome',
      })
    } else if (next === 'denied') {
      toast.error('Notifications were blocked. Re-enable them in your browser settings.')
    }
  }

  return (
    <button type="button" className="list-row" onClick={enable}>
      <Bell className="list-row-icon" size={20} aria-hidden />
      <span className="list-row-label">Enable reminders</span>
      <span className="list-row-chevron" aria-hidden>
        ›
      </span>
    </button>
  )
}
