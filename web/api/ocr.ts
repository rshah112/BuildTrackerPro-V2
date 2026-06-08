// Vercel Edge function: server-side receipt/invoice extraction via Cloudflare Workers AI
// (Llama 3.2 11B Vision). The client sends a base64 image (a photo, or a PDF page it already
// rasterized); we ask the vision model for structured JSON and return it. Far more accurate
// than in-browser OCR and device-independent. Requires a valid Supabase JWT (same as r2-sign)
// so it isn't an open AI proxy. If CF_AI_TOKEN isn't set it returns 501 and the client falls
// back to on-device OCR — so this is safe to ship before the token exists.
//
// Setup: create a Cloudflare API token with "Workers AI: Read" and set CF_AI_TOKEN in Vercel.
// The account id is reused from the existing R2_ACCOUNT_ID env (same Cloudflare account).

import { createClient } from '@supabase/supabase-js'

export const config = { runtime: 'edge' }

const MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function userIdFromRequest(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  const url =
    process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? 'https://wzbtxwnvplpnwmavfdwx.supabase.co'
  const key =
    process.env.SUPABASE_SERVICE_ROLE ??
    process.env.SUPABASE_ANON_KEY ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind6YnR4d252cGxwbndtYXZmZHd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Njk2MzEsImV4cCI6MjA5NTE0NTYzMX0.P1BlgrtVK3CpRLjcZsZugB-78_HO4GFSUXplCtbbBAY'
  const supa = createClient(url, key)
  const { data, error } = await supa.auth.getUser(token)
  return error || !data.user ? null : data.user.id
}

const SYSTEM = 'You read receipts and invoices and reply with ONLY a single minified JSON object — no prose, no code fences.'
const USER =
  'Extract from this receipt/invoice image and return exactly this JSON shape: ' +
  '{"vendor":string|null,"amount":number|null,"date":string|null,"invoiceNumber":string|null,"dueDate":string|null}. ' +
  'vendor = the business/biller name (header). amount = the grand total / balance due as a plain number, no currency symbol. ' +
  'date = the receipt or invoice date as YYYY-MM-DD. dueDate = payment due date as YYYY-MM-DD. ' +
  'Use null for anything not present. Output only the JSON object.'

function extractJson(s: string): Record<string, unknown> | null {
  if (!s) return null
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a < 0 || b <= a) return null
  try {
    return JSON.parse(s.slice(a, b + 1))
  } catch {
    return null
  }
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const pad = (n: number | string) => String(n).padStart(2, '0')

// The vision model returns the date in whatever format the document used (e.g. 06/05/2026,
// June 5 2026), so normalize any common format to ISO yyyy-mm-dd (what the form expects).
function normDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/) // ISO-ish
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/) // M/D/Y
  if (m) {
    let y = Number(m[3])
    if (y < 100) y += 2000
    const mo = Number(m[1])
    const d = Number(m[2])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`
  }
  m = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(20\d{2})/) // "June 5, 2026"
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(m[2])}`
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(20\d{2})/) // "5 June 2026"
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(m[1])}`
  return null
}

function normAmount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^0-9.]/g, ''))
    return Number.isFinite(n) && n > 0 ? n : null
  }
  return null
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await userIdFromRequest(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const accountId = process.env.CF_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID
  const token = process.env.CF_AI_TOKEN
  if (!accountId || !token) return json({ error: 'ocr not configured' }, 501)

  const body = (await req.json().catch(() => null)) as { image?: string } | null
  if (!body?.image) return json({ error: 'no image' }, 400)

  let cf: Response
  try {
    cf = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${MODEL}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: USER },
        ],
        image: body.image,
        max_tokens: 512,
      }),
    })
  } catch {
    return json({ error: 'ocr upstream unreachable' }, 502)
  }
  if (!cf.ok) return json({ error: 'ocr upstream failed', status: cf.status }, 502)

  const data = (await cf.json().catch(() => null)) as { result?: { response?: string } | string } | null
  const out = typeof data?.result === 'string' ? data.result : data?.result?.response ?? ''
  const parsed = extractJson(out)
  if (!parsed) return json({ error: 'no data' }, 422)

  return json({
    vendor: typeof parsed.vendor === 'string' && parsed.vendor.trim() ? parsed.vendor.trim().slice(0, 80) : null,
    amount: normAmount(parsed.amount),
    date: normDate(parsed.date),
    invoiceNumber: parsed.invoiceNumber ? String(parsed.invoiceNumber).slice(0, 24) : null,
    dueDate: normDate(parsed.dueDate),
  })
}
