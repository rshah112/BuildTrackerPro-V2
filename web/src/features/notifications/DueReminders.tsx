import { useEffect } from 'react'
import type { ChangeOrder } from '../../domain/types'
import { useRows } from '../../data/hooks'
import { fmt, sumBy } from '../../lib/money'
import { showLocalNotification, setBadge } from '../../lib/notifications'
import { cashFlowPayments, localToday } from '../cashflow/cashFlow'
import { useExpenses } from '../expenses/useExpenses'

const LAST_KEY = 'btp.lastDueNotify'

/** Mounted only when notifications are granted + a project is selected. Keeps the app-icon
 *  badge in sync with the count of payments coming due/overdue, and fires at most ONE local
 *  reminder per local day summarizing them. (Phase 1: local, on-open. Phase 2 upgrades this
 *  to a server cron so it reaches a fully-closed app.) */
export function DueReminders({ projectId }: { projectId: string }) {
  const { data: expenses = [] } = useExpenses(projectId)
  const { data: changeOrders = [] } = useRows<ChangeOrder>('change_orders', { projectId })

  useEffect(() => {
    const payments = cashFlowPayments(expenses, changeOrders, localToday())
    const count = payments.length
    setBadge(count)
    if (count === 0) return

    const today = localToday()
    try {
      if (localStorage.getItem(LAST_KEY) === today) return // already nudged today
    } catch {
      /* ignore */
    }
    const total = sumBy(payments, (p) => p.amount)
    void showLocalNotification(`${count} payment${count === 1 ? '' : 's'} coming due — ${fmt(total)}`, {
      body: 'Tap to review upcoming and overdue invoices and change orders.',
      url: '/cashflow',
      tag: 'due-reminder',
    }).then((ok) => {
      if (ok) {
        try {
          localStorage.setItem(LAST_KEY, today)
        } catch {
          /* ignore */
        }
      }
    })
  }, [expenses, changeOrders])

  return null
}
