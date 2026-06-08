// Best-effort receipt/invoice extraction. The heavy libraries — tesseract.js (OCR wasm + lang
// data, fetched from CDN at runtime) and pdfjs-dist (PDF parsing) — are dynamically imported
// ONLY when the user scans/uploads a file, so they never touch the main bundle. Parsing is
// heuristic: the user always confirms the result in the form, so a wrong guess is harmless.
//
// Three inputs are handled: an image (Tesseract OCR), a digital PDF (pdfjs text layer — fast
// and accurate, no OCR), and a scanned/image PDF (pdfjs rasterizes page 1, then Tesseract).
// The pdf.js worker is bundled (Vite `?url`) so digital-PDF parsing works offline.

import './installWithResolvers' // main-thread Promise.withResolvers polyfill (pdf.js v6 needs it)
import PdfjsWorker from './pdfWorker?worker'

export interface ReceiptScan {
  vendor: string | null
  amount: number | null
  /** ISO yyyy-mm-dd, or null. */
  date: string | null
  invoiceNumber: string | null
  /** ISO yyyy-mm-dd, or null. */
  dueDate: string | null
  raw: string
}

// Money tokens: optional $, optional thousands separators, optional 1–2 decimals. The bare
// `\d+` arm catches un-formatted amounts (e.g. "5000") — those are only trusted on a labeled
// total line, never in the largest-number fallback (where they'd often be an invoice/account #).
const MONEY_RE = /\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)/g
// Labels that mark the grand total / amount owed. `\btotal\b` deliberately excludes "subtotal".
const TOTAL_RE = /\b(grand\s*total|balance\s*due|amount\s*due|total\s*due|amount\s*payable|please\s*pay|pay\s*this\s*amount|total)\b/i
const SUBTOTAL_RE = /sub\s*-?\s*total/i

/** @internal exported for unit tests. */
export function parseMoney(s: string): number | null {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

interface MoneyTok {
  val: number
  /** Has a $, comma, or decimal — i.e. looks like currency, not a bare id/year/qty. */
  shaped: boolean
}
function moneyOnLine(line: string): MoneyTok[] {
  const out: MoneyTok[] = []
  for (const m of line.matchAll(MONEY_RE)) {
    const val = parseMoney(m[1])
    if (val != null) out.push({ val, shaped: /[$.,]/.test(m[0]) })
  }
  return out
}

/** The amount on a labeled total line (grand total / balance due / amount due / total, excluding
 *  sub-total) wins; otherwise the largest *currency-shaped* figure ($, comma, or decimal) — so an
 *  invoice #, account #, phone number, or year is never mistaken for the amount. */
export function parseAmount(text: string): number | null {
  let best: number | null = null
  for (const line of text.split('\n')) {
    if (SUBTOTAL_RE.test(line) || !TOTAL_RE.test(line)) continue
    const toks = moneyOnLine(line)
    const shaped = toks.filter((t) => t.shaped)
    const pool = shaped.length ? shaped : toks // trust a bare number only if it's the lone figure
    if (pool.length) {
      const v = Math.max(...pool.map((t) => t.val))
      if (best == null || v > best) best = v
    }
  }
  if (best != null) return best
  const shaped = text.split('\n').flatMap(moneyOnLine).filter((t) => t.shaped).map((t) => t.val)
  return shaped.length ? Math.max(...shaped) : null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Recognize common date formats in a string and normalize the first to ISO yyyy-mm-dd. */
function extractDate(s: string): string | null {
  const iso = s.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${pad(Number(m))}-${pad(Number(d))}`
  }
  const mdy = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
  if (mdy) {
    const [, m, d, y] = mdy
    let year = Number(y)
    if (year < 100) year += 2000
    const mo = Number(m)
    const day = Number(d)
    if (mo >= 1 && mo <= 12 && day >= 1 && day <= 31) return `${year}-${pad(mo)}-${pad(day)}`
  }
  return null
}

/** First date anywhere in the document — on a receipt the purchase date, on an invoice the
 *  invoice date (both sit near the top). */
export function parseDate(text: string): string | null {
  return extractDate(text)
}

/** Date on a line that mentions a due/payment-due label (skips bare "amount due" lines that
 *  carry a figure, not a date). Null when no such date is present. */
export function parseDueDate(text: string): string | null {
  for (const line of text.split('\n')) {
    if (!/\b(due\s*date|payment\s*due|due\s*on|net\s*\d+|due)\b/i.test(line)) continue
    const d = extractDate(line)
    if (d) return d
  }
  return null
}

/** Strip trailing punctuation/whitespace and cap length. */
function tidyRef(s: string): string {
  return s.replace(/[^A-Za-z0-9/-]+$/, '').slice(0, 24)
}

/** Pull an invoice number: "Invoice #: 1234", "Invoice No. A-1024", "INV-1024", "Invoice 778".
 *  Requires a digit so prose like "invoice attached" doesn't match. */
export function parseInvoiceNumber(text: string): string | null {
  const labeled = text.match(/invoice\s*(?:#|no\.?|number|num\.?)\s*[:.#-]*\s*([A-Za-z0-9][A-Za-z0-9/-]{1,23})/i)
  if (labeled && /\d/.test(labeled[1])) return tidyRef(labeled[1])
  const inv = text.match(/\b(INV[\s-]?\d{2,}[A-Za-z0-9-]*)\b/i)
  if (inv) return tidyRef(inv[1])
  const bare = text.match(/invoice\s*[:#]?\s*(\d{2,}[A-Za-z0-9-]*)/i)
  if (bare) return tidyRef(bare[1])
  return null
}

// Business-entity / trade-company words that signal a biller name (kept tight so line-item
// words like "Lumber 2x4" don't score as the vendor).
const VENDOR_BIZ = /\b(inc|llc|ltd|co|corp|corporation|company|services|construction|contracting|builders?|supply|associates|group|enterprises|&)\b/i
// Header/footer boilerplate that is never the vendor name.
const VENDOR_SKIP = /^(invoice|tax invoice|receipt|sales receipt|statement|estimate|quote|order|bill to|ship to|sold to|remit to|customer|account|date|due|terms|subtotal|total|page)\b/i

/** Best guess at the biller/store name. Scans the top lines, skips boilerplate, dates, addresses,
 *  phone/email/URL lines and pure-number lines, and prefers a business-looking name nearest the
 *  top (header). Falls back to an email/website domain (acme-supply.com → "Acme Supply"). */
export function parseVendor(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let best: string | null = null
  let bestScore = -1
  lines.slice(0, 12).forEach((line, i) => {
    if (line.length < 3 || line.length > 60) return
    if (!/[a-zA-Z]{2,}/.test(line)) return // need real letters, not just digits/symbols
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) return // date
    if (/^\d+\s+\S/.test(line)) return // street address ("123 Main St")
    if (/(@|www\.|https?:\/\/)/i.test(line)) return // email/URL — handled by the fallback
    if (/\b(tel|phone|fax)\b/i.test(line)) return
    if (VENDOR_SKIP.test(line)) return
    let s = 10 - i // earlier lines (header) score higher
    if (VENDOR_BIZ.test(line)) s += 5
    if (/^[A-Z0-9 &.,'-]+$/.test(line)) s += 2 // an ALL-CAPS header line
    if (s > bestScore) {
      bestScore = s
      best = line.slice(0, 80)
    }
  })
  if (best) return best
  const dom = text.match(/[\w.+-]+@([\w-]+)\.[a-z]{2,}|(?:www\.|https?:\/\/)([\w-]+)\.[a-z]{2,}/i)
  const name = dom?.[1] || dom?.[2]
  return name && name.length > 1
    ? name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 80)
    : null
}

/** Looks like a bill to pay (default Unpaid) rather than a receipt for something already paid
 *  (default Paid). An invoice number, a due date, or the literal word "invoice" are the tells. */
export function looksLikeInvoice(scan: Pick<ReceiptScan, 'invoiceNumber' | 'dueDate' | 'raw'>): boolean {
  return !!scan.invoiceNumber || !!scan.dueDate || /\binvoice\b/i.test(scan.raw)
}

function isPdf(file: File | Blob): boolean {
  if ((file.type || '') === 'application/pdf') return true
  const name = (file as File).name ?? ''
  return /\.pdf$/i.test(name)
}

async function imageOcr(file: File | Blob): Promise<string> {
  const { recognize } = await import('tesseract.js')
  const { data } = await recognize(file, 'eng')
  return data.text || ''
}

// Reuse one worker across PDFs. It's our custom entry (pdfWorker.ts) that polyfills
// Promise.withResolvers before loading pdf.js's worker, so parsing works on iOS Safari < 17.4.
let pdfWorker: Worker | null = null

async function loadPdf(file: File | Blob) {
  const pdfjs = await import('pdfjs-dist')
  if (!pdfWorker) pdfWorker = new PdfjsWorker()
  pdfjs.GlobalWorkerOptions.workerPort = pdfWorker
  const data = await file.arrayBuffer()
  return await pdfjs.getDocument({ data }).promise
}

/** Read the embedded text layer of a digital PDF (first few pages) and reconstruct READING ORDER
 *  from each item's position. pdf.js returns text items in content-stream order, NOT top-to-bottom,
 *  so relying on `hasEOL` jumbles the page — the header (vendor) and footer (total) end up
 *  scattered and the line-based parsers miss them. We instead sort by Y (top→bottom; PDF Y grows
 *  upward) then X (left→right) and group items into visual lines by their Y. */
async function pdfText(file: File | Blob): Promise<string> {
  const doc = await loadPdf(file)
  const pages = Math.min(doc.numPages, 3)
  const lines: string[] = []
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = (content.items as Array<{ str?: string; transform?: number[] }>)
      .filter((it) => typeof it.str === 'string' && it.str.trim() !== '' && Array.isArray(it.transform))
      .map((it) => ({ x: it.transform![4], y: Math.round(it.transform![5]), s: it.str as string }))
      .sort((a, b) => b.y - a.y || a.x - b.x)
    let lineY: number | null = null
    let cur: string[] = []
    for (const it of items) {
      if (lineY === null) lineY = it.y
      else if (Math.abs(it.y - lineY) > 3) {
        lines.push(cur.join(' '))
        cur = []
        lineY = it.y
      }
      cur.push(it.s)
    }
    if (cur.length) lines.push(cur.join(' '))
  }
  return lines.join('\n')
}

/** Scanned (image-only) PDF: rasterize page 1 at 2.5× (sharper small header/footer text for OCR)
 *  and run it through Tesseract. */
async function pdfOcr(file: File | Blob): Promise<string> {
  const doc = await loadPdf(file)
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2.5 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  await page.render({ canvas, viewport }).promise
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return blob ? await imageOcr(blob) : ''
}

async function extractText(file: File | Blob): Promise<string> {
  if (isPdf(file)) {
    const text = await pdfText(file)
    if (text.trim().length >= 20) return text // digital PDF with a real text layer
    return await pdfOcr(file) // scanned PDF: rasterize + OCR
  }
  return await imageOcr(file)
}

/** Render the file to a downscaled JPEG data URL for the vision model: a PDF's first page is
 *  rasterized via pdf.js; an image is drawn to a canvas and scaled to ≤1600px. */
async function fileToImageDataUrl(file: File | Blob): Promise<string | null> {
  const MAX = 1600
  if (isPdf(file)) {
    const doc = await loadPdf(file)
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvas, viewport }).promise
    return canvas.toDataURL('image/jpeg', 0.85)
  }
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = url
    })
    const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.85)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Ask the server (Cloudflare Workers AI vision) to extract structured fields. Returns null if
 *  the endpoint is unconfigured/unreachable/unhelpful, so the caller can fall back to local OCR. */
async function serverExtract(image: string): Promise<ReceiptScan | null> {
  const { supabase } = await import('./supabase')
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify({ image }),
  })
  if (!res.ok) return null
  const j = (await res.json().catch(() => null)) as Partial<ReceiptScan> | null
  if (!j) return null
  return {
    vendor: j.vendor ?? null,
    amount: typeof j.amount === 'number' ? j.amount : null,
    date: j.date ?? null,
    invoiceNumber: j.invoiceNumber ?? null,
    dueDate: j.dueDate ?? null,
    raw: '',
  }
}

export async function scanReceipt(file: File | Blob): Promise<ReceiptScan> {
  // Prefer server-side vision OCR — far more accurate on real invoices and device-independent.
  // Silently falls back to on-device OCR if it's unconfigured, offline, or returns nothing useful.
  try {
    const image = await fileToImageDataUrl(file)
    if (image) {
      const r = await serverExtract(image)
      if (r && (r.vendor || r.amount != null || r.invoiceNumber)) return r
    }
  } catch {
    // ignore — fall through to local OCR
  }

  const text = await extractText(file)
  return {
    vendor: parseVendor(text),
    amount: parseAmount(text),
    date: parseDate(text),
    invoiceNumber: parseInvoiceNumber(text),
    dueDate: parseDueDate(text),
    raw: text,
  }
}
