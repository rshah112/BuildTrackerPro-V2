// Daily reminder cron (Vercel Cron → see vercel.json "crons"). Reads each owner's unpaid
// invoices + change orders (service role, bypassing RLS) and sends a Web Push summary of
// what's overdue or coming due, so the reminder reaches a FULLY CLOSED app. Node runtime
// (NOT edge) — web-push needs Node crypto/zlib.
//
// Activation requires two server-only env vars in Vercel: SUPABASE_SERVICE_ROLE (so the
// cron can read across RLS) and VAPID_PRIVATE_KEY. Until both are set this returns a
// no-op 200 so the scheduled job never errors.

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import type { IncomingMessage, ServerResponse } from 'node:http'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://wzbtxwnvplpnwmavfdwx.supabase.co'
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE ?? ''
const VAPID_PUBLIC =
  process.env.VAPID_PUBLIC_KEY ??
  process.env.VITE_VAPID_PUBLIC_KEY ??
  'BDk300BdpTcg4CxGWlYuY3aHy0p78M5kPVQXNFPTRPIXbnbnEVz3kacNa4xGQ2l9ncTE2aJvZIgYZSxAoSr4HUQ'
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const LEAD_DAYS = 3
const TZ = 'America/New_York'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

interface ExpenseRow {
  amount: number
  amount_paid: number
  is_paid: boolean
  vendor_name: string
  due_date: string | null
  expected_payment_date: string | null
}
interface CoRow {
  title: string
  amount: number
  status: string
  expected_payment_date: string | null
}
interface SubRow {
  id: string
  owner: string
  endpoint: string
  p256dh: string
  auth: string
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Today as yyyy-mm-dd in the project's timezone (so "overdue" matches the user's calendar). */
function todayInTz(): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date(),
  )
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** An unpaid expense's outstanding balance (mirrors lib/expenseMath.balanceDue). */
function expenseBalance(e: ExpenseRow): number {
  const effectivePaid = e.is_paid ? (e.amount_paid > 0 ? e.amount_paid : e.amount) : 0
  return Math.max(0, e.amount - effectivePaid)
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // If a CRON_SECRET is configured, require it (Vercel Cron sends it automatically).
  const secret = process.env.CRON_SECRET
  if (secret && req.headers['authorization'] !== `Bearer ${secret}`) {
    return send(res, 401, { ok: false, error: 'unauthorized' })
  }
  if (!SERVICE_ROLE || !VAPID_PRIVATE) {
    return send(res, 200, { ok: false, reason: 'push not configured (set SUPABASE_SERVICE_ROLE + VAPID_PRIVATE_KEY)' })
  }

  webpush.setVapidDetails('mailto:rajrulz@aol.com', VAPID_PUBLIC, VAPID_PRIVATE)
  const supa = createClient(SUPABASE_URL, SERVICE_ROLE, {
    db: { schema: 'buildtracker' },
    auth: { persistSession: false },
  })

  const { data: subs, error: subErr } = await supa
    .from('push_subscriptions')
    .select('id,owner,endpoint,p256dh,auth')
  if (subErr) return send(res, 500, { ok: false, error: subErr.message })
  if (!subs || subs.length === 0) return send(res, 200, { ok: true, sent: 0, owners: 0 })

  const today = todayInTz()
  const soon = addDays(today, LEAD_DAYS)
  const owners = [...new Set((subs as SubRow[]).map((s) => s.owner))]

  let sent = 0
  const dead: string[] = []

  for (const owner of owners) {
    const [{ data: exp }, { data: cos }] = await Promise.all([
      supa
        .from('expenses')
        .select('amount,amount_paid,is_paid,vendor_name,due_date,expected_payment_date')
        .eq('owner', owner)
        .is('deleted_at', null),
      supa
        .from('change_orders')
        .select('title,amount,status,expected_payment_date')
        .eq('owner', owner)
        .is('deleted_at', null),
    ])

    let overdue = 0
    let dueSoon = 0
    let total = 0
    for (const e of (exp ?? []) as ExpenseRow[]) {
      const bal = expenseBalance(e)
      if (bal <= 0) continue
      const expected = e.expected_payment_date ?? e.due_date
      if (!expected) continue
      if (expected < today) {
        overdue++
        total += bal
      } else if (expected <= soon) {
        dueSoon++
        total += bal
      }
    }
    for (const o of (cos ?? []) as CoRow[]) {
      if (o.status === 'paid' || !o.expected_payment_date) continue
      if (o.expected_payment_date < today) {
        overdue++
        total += o.amount
      } else if (o.expected_payment_date <= soon) {
        dueSoon++
        total += o.amount
      }
    }

    const count = overdue + dueSoon
    if (count === 0) continue

    const bits = [overdue ? `${overdue} overdue` : '', dueSoon ? `${dueSoon} due soon` : ''].filter(Boolean)
    const payload = JSON.stringify({
      title: `${count} payment${count === 1 ? '' : 's'} need attention — ${usd.format(total)}`,
      body: `${bits.join(' · ')}. Tap to review cash flow.`,
      url: '/cashflow',
      tag: 'due-reminder',
    })

    const ownerSubs = (subs as SubRow[]).filter((s) => s.owner === owner)
    await Promise.all(
      ownerSubs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          sent++
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode
          if (code === 404 || code === 410) dead.push(s.id) // expired subscription → prune
        }
      }),
    )
  }

  if (dead.length) await supa.from('push_subscriptions').delete().in('id', dead)

  return send(res, 200, { ok: true, owners: owners.length, sent, pruned: dead.length, at: new Date().toISOString() })
}
