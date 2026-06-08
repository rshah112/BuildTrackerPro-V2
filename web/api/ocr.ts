// Vercel Edge function: server-side receipt/invoice extraction via Cloudflare Workers AI.
// PDFs → text extracted with unpdf (pure-JS, no canvas/worker) → a text model. Images → a
// vision model. Runs entirely server-side so it does NOT depend on the client's pdf.js, which
// is unreliable in installed iOS PWAs. Requires a Supabase JWT (same as r2-sign). Returns 501
// when CF_AI_TOKEN is unset, so it's safe before setup (client falls back to manual entry).

import { createClient } from '@supabase/supabase-js'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'

export const config = { runtime: 'edge' }

const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct'
const TEXT_MODEL = '@cf/meta/llama-3.1-8b-instruct'

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

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}
const pad = (n: number | string) => String(n).padStart(2, '0')

function normDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = s.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  m = s.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (m) {
    let y = Number(m[3])
    if (y < 100) y += 2000
    const mo = Number(m[1])
    const d = Number(m[2])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`
  }
  m = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(20\d{2})/)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(m[2])}`
  m = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(20\d{2})/)
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

const SYSTEM = 'You read receipts and invoices and reply with ONLY a single minified JSON object — no prose, no code fences.'
const SHAPE = '{"vendor":string|null,"amount":number|null,"date":string|null,"invoiceNumber":string|null,"dueDate":string|null}'
const FIELDS =
  'vendor = the business/biller name. amount = the grand total / total due / balance due as a plain number (no currency symbol). ' +
  'date = the receipt or invoice date. dueDate = the payment due date. Use null for anything not present. Output only the JSON object.'

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}

async function runModel(accountId: string, token: string, model: string, payload: unknown): Promise<string | null> {
  const cf = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!cf.ok) return null
  const data = (await cf.json().catch(() => null)) as { result?: { response?: string } | string } | null
  return typeof data?.result === 'string' ? data.result : data?.result?.response ?? null
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const userId = await userIdFromRequest(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const accountId = process.env.CF_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID
  const token = process.env.CF_AI_TOKEN
  if (!accountId || !token) return json({ error: 'ocr not configured' }, 501)

  const body = (await req.json().catch(() => null)) as { data?: string; contentType?: string; filename?: string } | null
  const data = body?.data
  if (!data || typeof data !== 'string') return json({ error: 'no data' }, 400)
  const contentType = body?.contentType ?? ''
  const isPdf = contentType === 'application/pdf' || /\.pdf$/i.test(body?.filename ?? '')

  let out: string | null = null
  try {
    if (isPdf) {
      const pdf = await getDocumentProxy(b64ToBytes(data))
      const { text } = await extractPdfText(pdf, { mergePages: true })
      if (text && text.trim().length > 10) {
        out = await runModel(accountId, token, TEXT_MODEL, {
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: `From the invoice/receipt text below return exactly ${SHAPE}. ${FIELDS}\n\nTEXT:\n${text.slice(0, 8000)}` },
          ],
          max_tokens: 400,
        })
      }
    } else {
      out = await runModel(accountId, token, VISION_MODEL, {
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Extract from this receipt/invoice image and return exactly ${SHAPE}. ${FIELDS}` },
        ],
        image: `data:${contentType || 'image/jpeg'};base64,${data}`,
        max_tokens: 400,
      })
    }
  } catch {
    return json({ error: 'ocr failed' }, 502)
  }

  const parsed = out ? extractJson(out) : null
  if (!parsed) return json({ error: 'no data' }, 422)

  return json({
    vendor: typeof parsed.vendor === 'string' && parsed.vendor.trim() ? parsed.vendor.trim().slice(0, 80) : null,
    amount: normAmount(parsed.amount),
    date: normDate(parsed.date),
    invoiceNumber: parsed.invoiceNumber ? String(parsed.invoiceNumber).slice(0, 24) : null,
    dueDate: normDate(parsed.dueDate),
  })
}
