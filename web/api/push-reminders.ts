// Daily reminder cron (Vercel Cron → see vercel.json "crons"). Reads each owner's unpaid
// invoices + change orders (service role, bypassing RLS) and sends a Web Push summary of
// what's overdue or coming due, so the reminder reaches a FULLY CLOSED app. Node runtime
// (NOT edge) — web-push needs Node crypto/zlib.
//
// Activation requires explicit Supabase and VAPID server configuration in Vercel.
// Until it is complete this returns a no-op 200 so the scheduled job never errors.

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import type { IncomingMessage, ServerResponse } from 'node:http'

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE ?? ''
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ?? process.env.VITE_VAPID_PUBLIC_KEY ?? ''
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? ''
const LEAD_DAYS = 3
const TZ = 'America/New_York'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

interface ExpenseRow {
  amount: number
  amount_paid: number
  retainage_amount: number
  is_paid: boolean
  vendor_name: string
  due_date: string | null
  expected_payment_date: string | null
  change_order_id: string | null
  project_id: string
}
interface CoRow {
  id: string
  title: string
  amount: number
  status: string
  expected_payment_date: string | null
  project_id: string
}
interface SubRow {
  id: string
  owner: string
  endpoint: string
  p256dh: string
  auth: string
}
interface PrefRow {
  owner: string
  lead_days: number
  quiet_start: number
  quiet_end: number
  remind_due_soon: boolean
  remind_overdue: boolean
  remind_change_orders: boolean
}
const DEFAULT_PREF: Omit<PrefRow, 'owner'> = {
  lead_days: LEAD_DAYS,
  quiet_start: 21,
  quiet_end: 7,
  remind_due_soon: true,
  remind_overdue: true,
  remind_change_orders: true,
}

/** Current hour (0–23) in the project timezone. */
function currentHourInTz(): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }).formatToParts(
    new Date(),
  )
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  return h === 24 ? 0 : h
}
/** Is hour `h` inside the quiet window [start, end)? Handles windows that wrap midnight. */
function inQuietHours(h: number, start: number, end: number): boolean {
  if (start === end) return false
  return start < end ? h >= start && h < end : h >= start || h < end
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

/** An expense's currently payable balance (mirrors lib/expenseMath.payableBalance). */
function expenseBalance(e: ExpenseRow): number {
  const amount = Math.max(0, Math.round(e.amount * 100))
  const paid = e.is_paid ? Math.min(amount, Math.max(0, Math.round(e.amount_paid * 100))) : 0
  const balance = Math.max(0, amount - paid)
  const retainage = Math.min(balance, Math.max(0, Math.round((e.retainage_amount ?? 0) * 100)))
  return (balance - retainage) / 100
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Require CRON_SECRET. Vercel Cron sends it automatically as `Authorization: Bearer <secret>`.
  // Fail CLOSED when it is unset so this service-role-backed endpoint is never publicly callable
  // (an unset secret previously skipped the check, leaving it open to anyone with the URL).
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers['authorization'] !== `Bearer ${secret}`) {
    return send(res, 401, { ok: false, error: 'unauthorized' })
  }
  if (!SUPABASE_URL || !SERVICE_ROLE || !VAPID_PUBLIC || !VAPID_PRIVATE) {
    return send(res, 200, {
      ok: false,
      reason: 'push not configured (set SUPABASE_URL, SUPABASE_SERVICE_ROLE, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY)',
    })
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

  // Per-owner preferences (lead time, quiet hours, which reminder types). Missing → defaults.
  const { data: prefRows } = await supa.from('notification_prefs').select('*')
  const prefs = new Map<string, PrefRow>(((prefRows ?? []) as PrefRow[]).map((p) => [p.owner, p]))

  const today = todayInTz()
  const hourNow = currentHourInTz()
  const owners = [...new Set((subs as SubRow[]).map((s) => s.owner))]

  let sent = 0
  let skippedQuiet = 0
  const dead: string[] = []

  for (const owner of owners) {
    const pref = prefs.get(owner) ?? { owner, ...DEFAULT_PREF }
    if (inQuietHours(hourNow, pref.quiet_start, pref.quiet_end)) {
      skippedQuiet++
      continue
    }
    const soon = addDays(today, pref.lead_days)
    const [{ data: exp }, { data: cos }, { data: trashedProjects }] = await Promise.all([
      supa
        .from('expenses')
        .select('amount,amount_paid,retainage_amount,is_paid,vendor_name,due_date,expected_payment_date,change_order_id,project_id')
        .eq('owner', owner)
        .is('deleted_at', null),
      supa
        .from('change_orders')
        .select('id,title,amount,status,expected_payment_date,project_id')
        .eq('owner', owner)
        .is('deleted_at', null),
      // Don't nag about items that live inside a TRASHED project.
      supa.from('projects').select('id').eq('owner', owner).not('deleted_at', 'is', null),
    ])
    const trashed = new Set(((trashedProjects ?? []) as { id: string }[]).map((p) => p.id))

    let overdue = 0
    let dueSoon = 0
    let total = 0
    const invoicedOrderIds = new Set<string>()
    for (const e of (exp ?? []) as ExpenseRow[]) {
      if (trashed.has(e.project_id)) continue
      if (e.change_order_id) invoicedOrderIds.add(e.change_order_id)
      const bal = expenseBalance(e)
      if (bal <= 0) continue
      // Compare date-only: expected_payment_date is a timestamptz, and a same-day time component
      // would sort after the date-only `soon`/`today` strings and miss the boundary day.
      const expected = (e.expected_payment_date ?? e.due_date)?.slice(0, 10)
      if (!expected) continue
      if (expected < today) {
        if (!pref.remind_overdue) continue
        overdue++
        total += bal
      } else if (expected <= soon) {
        if (!pref.remind_due_soon) continue
        dueSoon++
        total += bal
      }
    }
    if (pref.remind_change_orders) {
      for (const o of (cos ?? []) as CoRow[]) {
        if (
          o.status === 'paid' ||
          invoicedOrderIds.has(o.id) ||
          !o.expected_payment_date ||
          trashed.has(o.project_id)
        )
          continue
        const expected = o.expected_payment_date.slice(0, 10)
        if (expected < today) {
          overdue++
          total += o.amount
        } else if (expected <= soon) {
          dueSoon++
          total += o.amount
        }
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

  return send(res, 200, {
    ok: true,
    owners: owners.length,
    sent,
    pruned: dead.length,
    skippedQuiet,
    at: new Date().toISOString(),
  })
}
