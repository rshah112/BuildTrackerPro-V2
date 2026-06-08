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

const MONEY_RE = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g

/** @internal exported for unit tests. */
export function parseMoney(s: string): number | null {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Largest amount on a line mentioning "total" (excluding "subtotal"), else the largest
 *  amount anywhere — on most receipts the grand total is also the biggest figure. On invoices,
 *  "balance due"/"amount due" also wins. */
export function parseAmount(text: string): number | null {
  const lines = text.split('\n')
  let totalLine = -1
  for (const line of lines) {
    const lower = line.toLowerCase()
    const isTotal = (lower.includes('total') && !lower.includes('subtotal')) || lower.includes('amount due') || lower.includes('balance due')
    if (isTotal) {
      const nums = (line.match(MONEY_RE) ?? []).map(parseMoney).filter((n): n is number => n != null)
      if (nums.length) totalLine = Math.max(totalLine, ...nums)
    }
  }
  if (totalLine >= 0) return totalLine
  const all = (text.match(MONEY_RE) ?? []).map(parseMoney).filter((n): n is number => n != null)
  return all.length ? Math.max(...all) : null
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

/** The vendor is usually the first substantial text line (store/biller name at the top). */
export function parseVendor(text: string): string | null {
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line.length < 3) continue
    if (!/[a-z]/i.test(line)) continue // skip pure number/symbol lines
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) continue // skip a leading date line
    if (/(receipt|invoice|order|cash|card|tel|phone)/i.test(line) && line.length < 8) continue
    return line.slice(0, 80)
  }
  return null
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

/** Read the embedded text layer of a digital PDF (first few pages), reconstructing line
 *  breaks from each item's end-of-line flag so the line-based parsers above still work. */
async function pdfText(file: File | Blob): Promise<string> {
  const doc = await loadPdf(file)
  const pages = Math.min(doc.numPages, 3)
  let out = ''
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      if (typeof item.str !== 'string') continue
      out += item.str + (item.hasEOL ? '\n' : ' ')
    }
    out += '\n'
  }
  return out
}

/** Scanned (image-only) PDF: rasterize page 1 at 2× and OCR it. */
async function pdfOcr(file: File | Blob): Promise<string> {
  const doc = await loadPdf(file)
  const page = await doc.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
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

export async function scanReceipt(file: File | Blob): Promise<ReceiptScan> {
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
