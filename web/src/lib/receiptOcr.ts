// Best-effort receipt OCR. tesseract.js (~a few MB of wasm + language data, fetched from CDN
// at runtime) is dynamically imported ONLY when the user taps "Scan receipt", so it never
// touches the main bundle. The parsing is heuristic — the user always confirms the result in
// the form, so a wrong guess is harmless.

export interface ReceiptScan {
  vendor: string | null
  amount: number | null
  /** ISO yyyy-mm-dd, or null. */
  date: string | null
  raw: string
}

const MONEY_RE = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g

/** @internal exported for unit tests. */
export function parseMoney(s: string): number | null {
  const n = Number(s.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** Largest amount on a line mentioning "total" (excluding "subtotal"), else the largest
 *  amount anywhere — on most receipts the grand total is also the biggest figure. */
export function parseAmount(text: string): number | null {
  const lines = text.split('\n')
  let totalLine = -1
  for (const line of lines) {
    const lower = line.toLowerCase()
    if (lower.includes('total') && !lower.includes('subtotal')) {
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

/** Recognize common receipt date formats and normalize to ISO yyyy-mm-dd. */
export function parseDate(text: string): string | null {
  const iso = text.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${pad(Number(m))}-${pad(Number(d))}`
  }
  const mdy = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/)
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

/** The vendor is usually the first substantial text line (store name at the top). */
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

export async function scanReceipt(file: File | Blob): Promise<ReceiptScan> {
  const { recognize } = await import('tesseract.js')
  const { data } = await recognize(file, 'eng')
  const text = data.text || ''
  return { vendor: parseVendor(text), amount: parseAmount(text), date: parseDate(text), raw: text }
}
