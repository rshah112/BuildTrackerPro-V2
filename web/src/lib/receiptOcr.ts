// Receipt/invoice extraction. Images use server-side Workers AI first and selectively run a
// local Tesseract pass when fields are missing or uncertain. PDFs stay server-only because
// client-side PDF parsing is unreliable in installed iOS PWAs. Every model value is validated
// again here; callers always receive field-level review metadata and a manual-entry fallback.

export type ReceiptDocumentType = 'receipt' | 'invoice' | 'unknown'
export type ReceiptFieldName = 'vendor' | 'amount' | 'date' | 'invoiceNumber' | 'dueDate'
export type ReceiptFieldSource = 'ai' | 'local' | 'both' | 'none'
type ReceiptScalar = string | number

export interface ReceiptField<T extends ReceiptScalar> {
  value: T | null
  confidence: number
  evidence: string | null
  source: ReceiptFieldSource
  needsReview: boolean
}

export interface ReceiptFields {
  vendor: ReceiptField<string>
  amount: ReceiptField<number>
  date: ReceiptField<string>
  invoiceNumber: ReceiptField<string>
  dueDate: ReceiptField<string>
}

export interface ReceiptScan {
  // Flat values remain for existing form callers.
  vendor: string | null
  amount: number | null
  /** ISO yyyy-mm-dd, or null. */
  date: string | null
  invoiceNumber: string | null
  /** ISO yyyy-mm-dd, or null. */
  dueDate: string | null
  /** Local OCR text only. Server output/document text is never returned here. */
  raw: string
  documentType: ReceiptDocumentType
  documentTypeConfidence: number
  fields: ReceiptFields
  needsReview: ReceiptFieldName[]
  warnings: string[]
  extraction: {
    usedAi: boolean
    usedLocalOcr: boolean
    manualFallback: boolean
  }
}

const FIELD_NAMES: ReceiptFieldName[] = ['vendor', 'amount', 'date', 'invoiceNumber', 'dueDate']
const MAX_AMOUNT = 100_000_000
const MAX_LOCAL_TEXT_CHARS = 50_000
const MAX_SERVER_FILE_BYTES = 3_000_000
const TARGET_IMAGE_BYTES = 2_600_000

const REVIEW_THRESHOLD: Record<ReceiptFieldName, number> = {
  vendor: 0.72,
  amount: 0.82,
  date: 0.82,
  invoiceNumber: 0.72,
  dueDate: 0.82,
}

function clampConfidence(value: unknown, hasValue: boolean, fallback = 0): number {
  if (!hasValue) return 0
  if (value == null) return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  const unit = n > 1 && n <= 100 ? n / 100 : n
  if (unit < 0 || unit > 1) return fallback
  return Math.round(unit * 100) / 100
}

function replaceControlCharacters(value: string): string {
  return Array.from(value, (character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127 ? ' ' : character
  }).join('')
}

function safeSnippet(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = replaceControlCharacters(value.normalize('NFKC'))
    .replace(/\s+/g, ' ')
    .trim()
  return text ? text.slice(0, 160) : null
}

function cleanVendor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = replaceControlCharacters(value.normalize('NFKC'))
    .replace(/\s+/g, ' ')
    .trim()
  return /[A-Za-z]{2}/.test(text) ? text.slice(0, 80) : null
}

function cleanInvoiceNumber(value: unknown): string | null {
  if (value == null) return null
  const text = String(value).normalize('NFKC').trim().replace(/^#\s*/, '')
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,23}$/.test(text) || !/\d/.test(text)) return null
  return text
}

const pad = (n: number | string) => String(n).padStart(2, '0')
const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

function validIsoDate(year: number, month: number, day: number): string | null {
  if (year < 1990 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

/** Strict calendar validation for both AI values and local OCR candidates. */
export function normalizeReceiptDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  let match = text.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (match) return validIsoDate(Number(match[1]), Number(match[2]), Number(match[3]))
  match = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/)
  if (match) {
    let year = Number(match[3])
    if (year < 100) year += 2000
    return validIsoDate(year, Number(match[1]), Number(match[2]))
  }
  match = text.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (match) return validIsoDate(Number(match[3]), MONTHS[match[1].slice(0, 3).toLowerCase()] ?? 0, Number(match[2]))
  match = text.match(/(\d{1,2})\s+([A-Za-z]{3,})\.?,?\s+(\d{4})/)
  if (match) return validIsoDate(Number(match[3]), MONTHS[match[2].slice(0, 3).toLowerCase()] ?? 0, Number(match[1]))
  return null
}

/** Reject negatives, malformed grouping/exponents, zero, and implausibly large expenses. */
export function normalizeReceiptAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0 || value > MAX_AMOUNT) return null
    return Math.round(value * 100) / 100
  }
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text || /[()\-+e]/i.test(text)) return null
  const numeric = text.replace(/^USD\s*/i, '').replace(/^\$\s*/, '').replace(/\s*USD$/i, '').trim()
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(numeric)) return null
  const amount = Number(numeric.replace(/,/g, ''))
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT
    ? Math.round(amount * 100) / 100
    : null
}

function emptyField<T extends ReceiptScalar>(): ReceiptField<T> {
  return { value: null, confidence: 0, evidence: null, source: 'none', needsReview: false }
}

function checkedField<T extends ReceiptScalar>(name: ReceiptFieldName, field: ReceiptField<T>): ReceiptField<T> {
  const confidence = clampConfidence(field.confidence, field.value != null)
  return {
    ...field,
    confidence,
    evidence: field.value == null ? null : safeSnippet(field.evidence),
    needsReview:
      field.value != null && (field.needsReview || confidence < REVIEW_THRESHOLD[name]),
  }
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)]
}

function buildScan(input: {
  documentType: ReceiptDocumentType
  documentTypeConfidence: number
  fields: ReceiptFields
  raw?: string
  warnings?: string[]
  forcedReview?: ReceiptFieldName[]
  extraction: ReceiptScan['extraction']
}): ReceiptScan {
  const fields: ReceiptFields = {
    vendor: checkedField('vendor', input.fields.vendor),
    amount: checkedField('amount', input.fields.amount),
    date: checkedField('date', input.fields.date),
    invoiceNumber: checkedField('invoiceNumber', input.fields.invoiceNumber),
    dueDate: checkedField('dueDate', input.fields.dueDate),
  }
  const needsReview = [...(input.forcedReview ?? [])]
  for (const name of FIELD_NAMES) if (fields[name].needsReview) needsReview.push(name)
  for (const required of ['vendor', 'amount', 'date'] as ReceiptFieldName[]) {
    if (fields[required].value == null) needsReview.push(required)
  }
  if (
    input.documentType === 'invoice' &&
    fields.invoiceNumber.value == null &&
    fields.dueDate.value == null
  ) {
    needsReview.push('invoiceNumber')
  }
  const useful = FIELD_NAMES.some((name) => fields[name].value != null)
  return {
    vendor: fields.vendor.value,
    amount: fields.amount.value,
    date: fields.date.value,
    invoiceNumber: fields.invoiceNumber.value,
    dueDate: fields.dueDate.value,
    raw: (input.raw ?? '').slice(0, MAX_LOCAL_TEXT_CHARS),
    documentType: input.documentType,
    documentTypeConfidence: clampConfidence(
      input.documentTypeConfidence,
      input.documentType !== 'unknown',
    ),
    fields,
    needsReview: unique(needsReview),
    warnings: unique(input.warnings ?? []),
    extraction: { ...input.extraction, manualFallback: input.extraction.manualFallback || !useful },
  }
}

export function emptyReceiptScan(warnings: string[] = []): ReceiptScan {
  return buildScan({
    documentType: 'unknown',
    documentTypeConfidence: 0,
    fields: {
      vendor: emptyField<string>(),
      amount: emptyField<number>(),
      date: emptyField<string>(),
      invoiceNumber: emptyField<string>(),
      dueDate: emptyField<string>(),
    },
    warnings,
    extraction: { usedAi: false, usedLocalOcr: false, manualFallback: true },
  })
}

interface Candidate<T extends ReceiptScalar> {
  value: T
  confidence: number
  evidence: string
}

function localField<T extends ReceiptScalar>(candidate: Candidate<T> | null, qualityFactor: number): ReceiptField<T> {
  if (!candidate) return emptyField<T>()
  const confidence = clampConfidence(candidate.confidence * qualityFactor, true)
  return {
    value: candidate.value,
    confidence,
    evidence: safeSnippet(candidate.evidence),
    source: 'local',
    needsReview: false,
  }
}

// ---- Money / amount parsing (local image fallback) ----
const MONEY_RE = /(?:USD\s*)?\$?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)/gi
const TOTAL_RE = /\b(grand\s*total|balance\s*due|amount\s*due|total\s*due|amount\s*payable|please\s*pay|pay\s*this\s*amount|total)\b/i
const STRONG_TOTAL_RE = /\b(grand\s*total|balance\s*due|amount\s*due|total\s*due|amount\s*payable|please\s*pay|pay\s*this\s*amount)\b/i
const SUBTOTAL_RE = /sub\s*-?\s*total/i

/** @internal exported for unit tests. */
export function parseMoney(value: string): number | null {
  return normalizeReceiptAmount(value)
}

interface MoneyToken {
  value: number
  shaped: boolean
}

function moneyOnLine(line: string): MoneyToken[] {
  const out: MoneyToken[] = []
  for (const match of line.matchAll(MONEY_RE)) {
    const start = match.index ?? 0
    const end = start + match[0].length
    if (/[-+(]\s*$/.test(line.slice(Math.max(0, start - 3), start))) continue
    if (/^\s*[-)]/.test(line.slice(end))) continue
    const numberOffset = match[0].lastIndexOf(match[1])
    const numberStart = start + Math.max(0, numberOffset)
    const beforeNumber = line[numberStart - 1] ?? ''
    const afterNumber = line[numberStart + match[1].length] ?? ''
    if (
      beforeNumber === '/' ||
      beforeNumber === ',' ||
      afterNumber === '/' ||
      afterNumber === ',' ||
      /[A-Za-z0-9]/.test(afterNumber)
    ) continue
    const value = parseMoney(match[1])
    if (value != null) out.push({ value, shaped: /\$|,|\.\d{1,2}\b|USD/i.test(match[0]) })
  }
  return out
}

function amountCandidate(text: string): Candidate<number> | null {
  let best: Candidate<number> | null = null
  for (const line of text.split('\n')) {
    if (SUBTOTAL_RE.test(line) || !TOTAL_RE.test(line)) continue
    const tokens = moneyOnLine(line)
    const shaped = tokens.filter((token) => token.shaped)
    const pool = shaped.length ? shaped : tokens
    if (!pool.length) continue
    const value = Math.max(...pool.map((token) => token.value))
    const candidate = {
      value,
      confidence: STRONG_TOTAL_RE.test(line) ? 0.96 : 0.9,
      evidence: line,
    }
    if (!best || candidate.confidence > best.confidence || value > best.value) best = candidate
  }
  if (best) return best

  const fallback: Array<{ value: number; line: string }> = []
  for (const line of text.split('\n')) {
    for (const token of moneyOnLine(line)) if (token.shaped) fallback.push({ value: token.value, line })
  }
  if (!fallback.length) return null
  const largest = fallback.reduce((current, item) => (item.value > current.value ? item : current))
  return { value: largest.value, confidence: 0.55, evidence: largest.line }
}

/** Labeled grand/balance totals win; otherwise use the largest currency-shaped candidate. */
export function parseAmount(text: string): number | null {
  return amountCandidate(text)?.value ?? null
}

// ---- Date parsing ----
function dateOnLine(line: string): string | null {
  return normalizeReceiptDate(line)
}

function dateCandidate(text: string): Candidate<string> | null {
  const lines = text.split('\n')
  for (const line of lines) {
    if (/\b(due\s*date|payment\s*due|due\s*on)\b/i.test(line)) continue
    if (!/\b(invoice|receipt|transaction|purchase|order)?\s*date\b/i.test(line)) continue
    const value = dateOnLine(line)
    if (value) return { value, confidence: 0.94, evidence: line }
  }
  for (const line of lines) {
    if (/\b(due\s*date|payment\s*due|due\s*on)\b/i.test(line)) continue
    const value = dateOnLine(line)
    if (value) return { value, confidence: 0.78, evidence: line }
  }
  return null
}

function dueDateCandidate(text: string): Candidate<string> | null {
  for (const line of text.split('\n')) {
    if (!/\b(due\s*date|payment\s*due|due\s*on|net\s*\d+|due)\b/i.test(line)) continue
    const value = dateOnLine(line)
    if (value) return { value, confidence: 0.94, evidence: line }
  }
  return null
}

export function parseDate(text: string): string | null {
  return dateCandidate(text)?.value ?? null
}

export function parseDueDate(text: string): string | null {
  return dueDateCandidate(text)?.value ?? null
}

// ---- Invoice number ----
function invoiceNumberCandidate(text: string): Candidate<string> | null {
  const labeled = text.match(/invoice\s*(?:#|no\.?|number|num\.?)\s*[:.#-]*\s*([A-Za-z0-9][A-Za-z0-9._/-]{1,23})/i)
  if (labeled) {
    const value = cleanInvoiceNumber(labeled[1])
    if (value) return { value, confidence: 0.95, evidence: labeled[0] }
  }
  const inv = text.match(/\b(INV[\s-]?\d{2,}[A-Za-z0-9-]*)\b/i)
  if (inv) {
    const value = cleanInvoiceNumber(inv[1])
    if (value) return { value, confidence: 0.86, evidence: inv[0] }
  }
  const bare = text.match(/invoice\s*[:#]?\s*(\d{2,}[A-Za-z0-9-]*)/i)
  if (bare) {
    const value = cleanInvoiceNumber(bare[1])
    if (value) return { value, confidence: 0.8, evidence: bare[0] }
  }
  return null
}

export function parseInvoiceNumber(text: string): string | null {
  return invoiceNumberCandidate(text)?.value ?? null
}

// ---- Vendor ----
const VENDOR_BIZ = /\b(inc|llc|ltd|co|corp|corporation|company|services|construction|contracting|builders?|supply|associates|group|enterprises|&)\b/i
const VENDOR_SKIP = /^(invoice|tax invoice|receipt|sales receipt|statement|estimate|quote|order|bill to|ship to|sold to|remit to|customer|account|date|due|terms|subtotal|total|page)\b/i

function vendorCandidate(text: string): Candidate<string> | null {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  let best: { line: string; score: number } | null = null
  lines.slice(0, 12).forEach((line, index) => {
    if (line.length < 3 || line.length > 60) return
    if (!/[a-zA-Z]{2,}/.test(line)) return
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(line)) return
    if (/^\d+\s+\S/.test(line)) return
    if (/(@|www\.|https?:\/\/)/i.test(line)) return
    if (/\b(tel|phone|fax)\b/i.test(line) || VENDOR_SKIP.test(line)) return
    let score = 10 - index
    if (VENDOR_BIZ.test(line)) score += 5
    if (/^[A-Z0-9 &.,'-]+$/.test(line)) score += 2
    if (!best || score > best.score) best = { line, score }
  })
  if (best) {
    const selected = best as { line: string; score: number }
    return {
      value: selected.line.slice(0, 80),
      confidence: Math.min(0.94, 0.68 + Math.max(0, selected.score) * 0.018),
      evidence: selected.line,
    }
  }
  const domain = text.match(/[\w.+-]+@([\w-]+)\.[a-z]{2,}|(?:www\.|https?:\/\/)([\w-]+)\.[a-z]{2,}/i)
  const name = domain?.[1] || domain?.[2]
  if (!name || name.length <= 1) return null
  const value = name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()).slice(0, 80)
  return { value, confidence: 0.58, evidence: domain?.[0] ?? value }
}

export function parseVendor(text: string): string | null {
  return vendorCandidate(text)?.value ?? null
}

function classifyLocalDocument(
  text: string,
  invoiceNumber: Candidate<string> | null,
  dueDate: Candidate<string> | null,
): { type: ReceiptDocumentType; confidence: number } {
  if (invoiceNumber || dueDate || /\b(tax\s+)?invoice\b/i.test(text)) return { type: 'invoice', confidence: 0.94 }
  if (/\b(receipt|paid|cashier|change|visa|mastercard|amex)\b|\bcard\s*\*+/i.test(text)) {
    return { type: 'receipt', confidence: 0.86 }
  }
  return { type: 'unknown', confidence: 0 }
}

/** Parse a local Tesseract transcript into the same confidence-aware shape as server AI. */
export function scanLocalText(text: string, tesseractConfidence = 85): ReceiptScan {
  const quality = clampConfidence(tesseractConfidence, true, 0.65)
  const qualityFactor = 0.55 + 0.45 * quality
  const vendor = vendorCandidate(text)
  const amount = amountCandidate(text)
  const date = dateCandidate(text)
  const invoiceNumber = invoiceNumberCandidate(text)
  const dueDate = dueDateCandidate(text)
  const classification = classifyLocalDocument(text, invoiceNumber, dueDate)
  return buildScan({
    documentType: classification.type,
    documentTypeConfidence: classification.confidence * qualityFactor,
    fields: {
      vendor: localField(vendor, qualityFactor),
      amount: localField(amount, qualityFactor),
      date: localField(date, qualityFactor),
      invoiceNumber: localField(invoiceNumber, qualityFactor),
      dueDate: localField(dueDate, qualityFactor),
    },
    raw: text,
    extraction: { usedAi: false, usedLocalOcr: true, manualFallback: false },
  })
}

/** Looks like a bill to pay (default Unpaid) vs a receipt already paid (default Paid). */
export function looksLikeInvoice(
  scan: Pick<ReceiptScan, 'invoiceNumber' | 'dueDate' | 'raw'> & Partial<Pick<ReceiptScan, 'documentType'>>,
): boolean {
  if (scan.documentType === 'invoice') return true
  if (scan.documentType === 'receipt') return false
  return !!scan.invoiceNumber || !!scan.dueDate || /\binvoice\b/i.test(scan.raw)
}

// ---- Untrusted server response parser ----
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

function serverField<T extends ReceiptScalar>(
  root: Record<string, unknown>,
  name: ReceiptFieldName,
  clean: (value: unknown) => T | null,
): ReceiptField<T> {
  const fields = asRecord(root.fields)
  const nested = fields ? asRecord(fields[name]) : null
  const rawValue = nested && 'value' in nested ? nested.value : root[name]
  const value = clean(rawValue)
  const rawConfidence = nested?.confidence ?? root[`${name}Confidence`]
  const confidence = clampConfidence(rawConfidence, value != null, nested ? 0 : 0.5)
  const evidence = value == null ? null : safeSnippet(nested?.evidence ?? root[`${name}Evidence`])
  return {
    value,
    confidence,
    evidence,
    source: value == null ? 'none' : 'ai',
    needsReview:
      Boolean(nested?.needsReview) ||
      (value != null && (confidence < REVIEW_THRESHOLD[name] || (nested != null && evidence == null))),
  }
}

/** Validate a structured response and legacy flat responses before values reach the form. */
export function parseServerOcrResponse(value: unknown): ReceiptScan | null {
  const root = asRecord(value)
  if (!root) return null
  const rawType = root.documentType
  const documentType: ReceiptDocumentType =
    rawType === 'receipt' || rawType === 'invoice' ? rawType : 'unknown'
  const fields: ReceiptFields = {
    vendor: serverField(root, 'vendor', cleanVendor),
    amount: serverField(root, 'amount', normalizeReceiptAmount),
    date: serverField(root, 'date', normalizeReceiptDate),
    invoiceNumber: serverField(root, 'invoiceNumber', cleanInvoiceNumber),
    dueDate: serverField(root, 'dueDate', normalizeReceiptDate),
  }
  if (!FIELD_NAMES.some((name) => fields[name].value != null)) return null
  const forcedReview = Array.isArray(root.needsReview)
    ? root.needsReview.filter((name): name is ReceiptFieldName =>
        typeof name === 'string' && FIELD_NAMES.includes(name as ReceiptFieldName),
      )
    : []
  const warnings = Array.isArray(root.warnings)
    ? root.warnings
        .filter((warning): warning is string => typeof warning === 'string' && /^[a-z0-9_-]{1,64}$/i.test(warning))
        .slice(0, 10)
    : []
  return buildScan({
    documentType,
    documentTypeConfidence: clampConfidence(root.documentTypeConfidence, documentType !== 'unknown'),
    fields,
    warnings,
    forcedReview,
    extraction: { usedAi: true, usedLocalOcr: false, manualFallback: false },
  })
}

// ---- Confidence-aware AI/local merge ----
function valuesAgree(name: ReceiptFieldName, left: ReceiptScalar, right: ReceiptScalar): boolean {
  if (name === 'amount') return typeof left === 'number' && typeof right === 'number' && Math.abs(left - right) <= 0.01
  const normalize = (value: ReceiptScalar) => String(value).normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '')
  return normalize(left) === normalize(right)
}

function mergeField<T extends ReceiptScalar>(
  name: ReceiptFieldName,
  ai: ReceiptField<T>,
  local: ReceiptField<T>,
): { field: ReceiptField<T>; conflict: boolean } {
  if (ai.value == null && local.value == null) return { field: emptyField<T>(), conflict: false }
  if (ai.value == null) return { field: { ...local }, conflict: false }
  if (local.value == null) return { field: { ...ai }, conflict: false }
  if (valuesAgree(name, ai.value, local.value)) {
    const confidence = Math.round((Math.max(ai.confidence, local.confidence) + (1 - Math.max(ai.confidence, local.confidence)) * 0.25) * 100) / 100
    return {
      field: {
        value: ai.value,
        confidence,
        evidence: ai.evidence ?? local.evidence,
        source: 'both',
        needsReview: confidence < REVIEW_THRESHOLD[name],
      },
      conflict: false,
    }
  }
  const localWins =
    ai.confidence < REVIEW_THRESHOLD[name] && local.confidence >= ai.confidence + 0.08
  const selected = localWins ? local : ai
  return { field: { ...selected, needsReview: true }, conflict: true }
}

export function mergeReceiptScans(ai: ReceiptScan, local: ReceiptScan): ReceiptScan {
  const vendor = mergeField('vendor', ai.fields.vendor, local.fields.vendor)
  const amount = mergeField('amount', ai.fields.amount, local.fields.amount)
  const date = mergeField('date', ai.fields.date, local.fields.date)
  const invoiceNumber = mergeField('invoiceNumber', ai.fields.invoiceNumber, local.fields.invoiceNumber)
  const dueDate = mergeField('dueDate', ai.fields.dueDate, local.fields.dueDate)
  const merged = { vendor, amount, date, invoiceNumber, dueDate }
  const forcedReview = FIELD_NAMES.filter((name) => merged[name].conflict)
  const warnings = [
    ...ai.warnings,
    ...local.warnings,
    ...forcedReview.map((name) => `${name}_conflict`),
  ]

  let documentType = ai.documentType
  let documentTypeConfidence = ai.documentTypeConfidence
  if (documentType === 'unknown' && local.documentType !== 'unknown') {
    documentType = local.documentType
    documentTypeConfidence = local.documentTypeConfidence
  } else if (documentType === local.documentType && documentType !== 'unknown') {
    documentTypeConfidence = Math.min(0.98, Math.max(documentTypeConfidence, local.documentTypeConfidence) + 0.04)
  } else if (
    local.documentType !== 'unknown' &&
    documentType !== 'unknown' &&
    local.documentType !== documentType
  ) {
    warnings.push('document_type_conflict')
    if (local.documentTypeConfidence > documentTypeConfidence + 0.08) {
      documentType = local.documentType
      documentTypeConfidence = local.documentTypeConfidence
    }
  }

  return buildScan({
    documentType,
    documentTypeConfidence,
    fields: {
      vendor: vendor.field,
      amount: amount.field,
      date: date.field,
      invoiceNumber: invoiceNumber.field,
      dueDate: dueDate.field,
    },
    raw: local.raw || ai.raw,
    warnings,
    forcedReview,
    extraction: {
      usedAi: ai.extraction.usedAi || local.extraction.usedAi,
      usedLocalOcr: ai.extraction.usedLocalOcr || local.extraction.usedLocalOcr,
      manualFallback: false,
    },
  })
}

/** Avoid an expensive local pass when AI already supplied the relevant fields confidently. */
export function shouldSupplementWithLocal(ai: ReceiptScan | null): boolean {
  if (!ai || ai.documentType === 'unknown') return true
  const uncertain = (name: ReceiptFieldName) => {
    const field = ai.fields[name]
    return field.value == null || field.needsReview || field.confidence < REVIEW_THRESHOLD[name]
  }
  if (uncertain('vendor') || uncertain('amount') || uncertain('date')) return true
  if (ai.documentType === 'invoice') {
    if (ai.fields.invoiceNumber.value == null && ai.fields.dueDate.value == null) return true
    if (
      (ai.fields.invoiceNumber.value != null && uncertain('invoiceNumber')) ||
      (ai.fields.dueDate.value != null && uncertain('dueDate'))
    ) return true
  }
  return false
}

// ---- Image preprocessing and OCR ----
export function fitImageDimensions(width: number, height: number, maxDimension = 2048) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || maxDimension <= 0) {
    return { width: 1, height: 1, scale: 1 }
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  dispose: () => void
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() }
    } catch {
      // Fall back to HTMLImageElement for browsers with partial ImageBitmap support.
    }
  }
  const url = URL.createObjectURL(file)
  const image = new Image()
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('image decode failed'))
      image.src = url
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('image encode failed'))),
      'image/jpeg',
      quality,
    )
  })
}

async function preprocessImage(file: Blob): Promise<Blob> {
  const decoded = await decodeImage(file)
  try {
    const fitted = fitImageDimensions(decoded.width, decoded.height)
    const canvas = document.createElement('canvas')
    canvas.width = fitted.width
    canvas.height = fitted.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no canvas context')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.filter = 'contrast(1.08) saturate(0.9)'
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)

    let encoded: Blob | null = null
    for (const quality of [0.88, 0.76, 0.64, 0.54]) {
      encoded = await canvasToBlob(canvas, quality)
      if (encoded.size <= TARGET_IMAGE_BYTES) return encoded
    }
    if (!encoded) throw new Error('image encode failed')

    const reduction = Math.max(0.55, Math.min(0.9, Math.sqrt(TARGET_IMAGE_BYTES / encoded.size) * 0.92))
    const smaller = document.createElement('canvas')
    smaller.width = Math.max(1, Math.round(canvas.width * reduction))
    smaller.height = Math.max(1, Math.round(canvas.height * reduction))
    const smallerContext = smaller.getContext('2d')
    if (!smallerContext) return encoded
    smallerContext.fillStyle = '#fff'
    smallerContext.fillRect(0, 0, smaller.width, smaller.height)
    smallerContext.imageSmoothingEnabled = true
    smallerContext.imageSmoothingQuality = 'high'
    smallerContext.drawImage(canvas, 0, 0, smaller.width, smaller.height)
    const reduced = await canvasToBlob(smaller, 0.64)
    return reduced.size < encoded.size ? reduced : encoded
  } finally {
    decoded.dispose()
  }
}

async function imageOcr(file: File | Blob): Promise<{ text: string; confidence: number }> {
  const { recognize } = await import('tesseract.js')
  const { data } = await recognize(file, 'eng')
  return {
    text: data.text || '',
    confidence: Number.isFinite(data.confidence) ? data.confidence : 60,
  }
}

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result)
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

interface OcrPayload {
  data: string
  contentType: string
}

interface PreparedDocument {
  payload: OcrPayload | null
  localImage: Blob | null
  warnings: string[]
}

function fileName(file: File | Blob): string {
  return 'name' in file && typeof file.name === 'string' ? file.name : ''
}

function isImageFile(file: File | Blob): boolean {
  return (file.type ?? '').startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(fileName(file))
}

function canonicalMime(file: File | Blob): string {
  const mime = (file.type ?? '').split(';', 1)[0].toLowerCase()
  if (mime === 'image/jpg') return 'image/jpeg'
  if (mime === 'application/octet-stream' && /\.pdf$/i.test(fileName(file))) return 'application/pdf'
  if (mime) return mime
  return /\.pdf$/i.test(fileName(file)) ? 'application/pdf' : ''
}

async function prepareDocument(file: File | Blob): Promise<PreparedDocument> {
  if (isImageFile(file)) {
    try {
      const processed = await preprocessImage(file)
      return {
        payload:
          processed.size <= MAX_SERVER_FILE_BYTES
            ? { data: await readAsBase64(processed), contentType: 'image/jpeg' }
            : null,
        localImage: processed,
        warnings: processed.size <= MAX_SERVER_FILE_BYTES ? [] : ['file_too_large_for_ai'],
      }
    } catch {
      const mime = canonicalMime(file)
      const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(mime)
      return {
        payload:
          supported && file.size <= MAX_SERVER_FILE_BYTES
            ? { data: await readAsBase64(file), contentType: mime }
            : null,
        localImage: file,
        warnings: supported ? ['image_preprocessing_failed'] : ['unsupported_image_format'],
      }
    }
  }

  const mime = canonicalMime(file)
  if (mime !== 'application/pdf') {
    return { payload: null, localImage: null, warnings: ['unsupported_document_format'] }
  }
  if (file.size > MAX_SERVER_FILE_BYTES) {
    return { payload: null, localImage: null, warnings: ['file_too_large_for_ai'] }
  }
  return {
    payload: { data: await readAsBase64(file), contentType: 'application/pdf' },
    localImage: null,
    warnings: [],
  }
}

async function serverExtract(payload: OcrPayload): Promise<ReceiptScan | null> {
  const { supabase } = await import('./supabase')
  const { data } = await supabase.auth.getSession()
  const response = await fetch('/api/ocr', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${data.session?.access_token ?? ''}`,
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) return null
  return parseServerOcrResponse(await response.json().catch(() => null))
}

function appendWarnings(scan: ReceiptScan, warnings: string[]): ReceiptScan {
  return warnings.length ? { ...scan, warnings: unique([...scan.warnings, ...warnings]) } : scan
}

export async function scanReceipt(file: File | Blob): Promise<ReceiptScan> {
  const image = isImageFile(file)
  let prepared: PreparedDocument
  try {
    prepared = await prepareDocument(file)
  } catch {
    prepared = {
      payload: null,
      localImage: image ? file : null,
      warnings: ['document_preparation_failed'],
    }
  }

  let ai: ReceiptScan | null = null
  if (prepared.payload) {
    try {
      ai = await serverExtract(prepared.payload)
    } catch {
      // Local OCR or manual entry remains available below.
    }
  }

  let local: ReceiptScan | null = null
  if (image && shouldSupplementWithLocal(ai)) {
    try {
      const result = await imageOcr(prepared.localImage ?? file)
      local = scanLocalText(result.text, result.confidence)
    } catch {
      // Preserve the AI result; otherwise return a structured manual fallback.
    }
  }

  const result = ai && local ? mergeReceiptScans(ai, local) : ai ?? local
  if (result) return appendWarnings(result, prepared.warnings)
  return emptyReceiptScan(unique([...prepared.warnings, 'automatic_extraction_unavailable']))
}
