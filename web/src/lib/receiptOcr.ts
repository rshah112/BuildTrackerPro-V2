// Receipt/invoice extraction. The primary path is SERVER-SIDE (api/ocr → Cloudflare Workers AI):
// the client just reads the file to base64 (PDF) or downscales it to a JPEG (image) and posts it,
// so it never runs pdf.js on the device (which is unreliable in installed iOS PWAs). Images keep a
// local Tesseract fallback for offline; PDFs rely on the server. The pure parsers below back the
// image fallback and are unit-tested. The user always confirms the result, so a wrong guess is harmless.

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

// ---- Money / amount parsing (used by the image fallback) ----
const MONEY_RE = /\$?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{1,2}|\d+)/g
const TOTAL_RE = /\b(grand\s*total|balance\s*due|amount\s*due|total\s*due|amount\s*payable|please\s*pay|pay\s*this\s*amount|total)\b/i
const SUBTOTAL_RE = /sub\s*-?\s*total/i

/** @internal exported for unit tests. */
export function parseMoney(s: string): number | null {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

interface MoneyTok {
  val: number
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

/** Amount on a labeled total line (grand total / balance due / total, excluding sub-total) wins;
 *  else the largest currency-shaped figure ($, comma, or decimal). */
export function parseAmount(text: string): number | null {
  let best: number | null = null
  for (const line of text.split('\n')) {
    if (SUBTOTAL_RE.test(line) || !TOTAL_RE.test(line)) continue
    const toks = moneyOnLine(line)
    const shaped = toks.filter((t) => t.shaped)
    const pool = shaped.length ? shaped : toks
    if (pool.length) {
      const v = Math.max(...pool.map((t) => t.val))
      if (best == null || v > best) best = v
    }
  }
  if (best != null) return best
  const shaped = text.split('\n').flatMap(moneyOnLine).filter((t) => t.shaped).map((t) => t.val)
  return shaped.length ? Math.max(...shaped) : null
}

// ---- Date parsing ----
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
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
export function parseDate(text: string): string | null {
  return extractDate(text)
}
export function parseDueDate(text: string): string | null {
  for (const line of text.split('\n')) {
    if (!/\b(due\s*date|payment\s*due|due\s*on|net\s*\d+|due)\b/i.test(line)) continue
    const d = extractDate(line)
    if (d) return d
  }
  return null
}

// ---- Invoice number ----
function tidyRef(s: string): string {
  return s.replace(/[^A-Za-z0-9/-]+$/, '').slice(0, 24)
}
export function parseInvoiceNumber(text: string): string | null {
  const labeled = text.match(/invoice\s*(?:#|no\.?|number|num\.?)\s*[:.#-]*\s*([A-Za-z0-9][A-Za-z0-9/-]{1,23})/i)
  if (labeled && /\d/.test(labeled[1])) return tidyRef(labeled[1])
  const inv = text.match(/\b(INV[\s-]?\d{2,}[A-Za-z0-9-]*)\b/i)
  if (inv) return tidyRef(inv[1])
  const bare = text.match(/invoice\s*[:#]?\s*(\d{2,}[A-Za-z0-9-]*)/i)
  if (bare) return tidyRef(bare[1])
  return null
}

// ---- Vendor ----
const VENDOR_BIZ = /\b(inc|llc|ltd|co|corp|corporation|company|services|construction|contracting|builders?|supply|associates|group|enterprises|&)\b/i
const VENDOR_SKIP = /^(invoice|tax invoice|receipt|sales receipt|statement|estimate|quote|order|bill to|ship to|sold to|remit to|customer|account|date|due|terms|subtotal|total|page)\b/i
export function parseVendor(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  let best: string | null = null
  let bestScore = -1
  lines.slice(0, 12).forEach((line, i) => {
    if (line.length < 3 || line.length > 60) return
    if (!/[a-zA-Z]{2,}/.test(line)) return
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) return
    if (/^\d+\s+\S/.test(line)) return
    if (/(@|www\.|https?:\/\/)/i.test(line)) return
    if (/\b(tel|phone|fax)\b/i.test(line)) return
    if (VENDOR_SKIP.test(line)) return
    let s = 10 - i
    if (VENDOR_BIZ.test(line)) s += 5
    if (/^[A-Z0-9 &.,'-]+$/.test(line)) s += 2
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

/** Looks like a bill to pay (default Unpaid) vs a receipt already paid (default Paid). */
export function looksLikeInvoice(scan: Pick<ReceiptScan, 'invoiceNumber' | 'dueDate' | 'raw'>): boolean {
  return !!scan.invoiceNumber || !!scan.dueDate || /\binvoice\b/i.test(scan.raw)
}

// ---- Image OCR (Tesseract) — image fallback only ----
async function imageOcr(file: File | Blob): Promise<string> {
  const { recognize } = await import('tesseract.js')
  const { data } = await recognize(file, 'eng')
  return data.text || ''
}

// ---- Server-side extraction (primary path) ----
function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error ?? new Error('read failed'))
    r.readAsDataURL(blob)
  })
}

/** Downscale an image to a JPEG and return its base64 (canvas only — no pdf.js, iOS-safe). */
async function downscaleImageToBase64(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = url
    })
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas context')
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
  } finally {
    URL.revokeObjectURL(url)
  }
}

interface OcrPayload {
  data: string
  contentType: string
  filename: string
}
async function fileToPayload(file: File | Blob): Promise<OcrPayload> {
  const name = (file as File).name ?? ''
  if ((file.type ?? '').startsWith('image/')) {
    try {
      return { data: await downscaleImageToBase64(file), contentType: 'image/jpeg', filename: name }
    } catch {
      // fall through to a raw read
    }
  }
  return { data: await readAsBase64(file), contentType: file.type || 'application/pdf', filename: name }
}

async function serverExtract(payload: OcrPayload): Promise<ReceiptScan | null> {
  const { supabase } = await import('./supabase')
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/ocr', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(payload),
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
  // Primary: server-side OCR (PDFs via text, images via vision) — off-device, so no client pdf.js.
  try {
    const r = await serverExtract(await fileToPayload(file))
    if (r && (r.vendor || r.amount != null || r.invoiceNumber || r.date)) return r
  } catch {
    // ignore — fall through
  }
  // Fallback for IMAGES only (Tesseract, offline). PDFs rely on the server; a failed PDF just
  // falls through to manual entry (client pdf.js is unreliable on iOS).
  if ((file.type ?? '').startsWith('image/')) {
    try {
      const text = await imageOcr(file)
      return {
        vendor: parseVendor(text),
        amount: parseAmount(text),
        date: parseDate(text),
        invoiceNumber: parseInvoiceNumber(text),
        dueDate: parseDueDate(text),
        raw: text,
      }
    } catch {
      // ignore
    }
  }
  return { vendor: null, amount: null, date: null, invoiceNumber: null, dueDate: null, raw: '' }
}
