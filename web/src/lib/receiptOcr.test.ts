import { describe, it, expect } from 'vitest'
import {
  parseAmount,
  parseDate,
  parseVendor,
  parseInvoiceNumber,
  parseDueDate,
  looksLikeInvoice,
  fitImageDimensions,
  mergeReceiptScans,
  normalizeReceiptAmount,
  normalizeReceiptDate,
  parseServerOcrResponse,
  scanLocalText,
  shouldSupplementWithLocal,
} from './receiptOcr'

const RECEIPT = `HOME DEPOT
123 Main St
04/17/2026

Lumber 2x4      12.50
Screws           8.99
Subtotal        21.49
Tax              1.51
TOTAL          23.00
VISA ****1234`

const INVOICE = `ABC PLUMBING LLC
456 Trade Ave
Invoice #: INV-20841
Invoice Date: 05/12/2026
Due Date: 06/11/2026

Rough-in plumbing      3,200.00
Permit                   150.00
Subtotal               3,350.00
Tax                      200.00
Balance Due            3,550.00`

describe('parseAmount', () => {
  it('prefers the grand total over subtotal/line items', () => {
    expect(parseAmount(RECEIPT)).toBe(23.0)
  })
  it('falls back to the largest amount when no total line', () => {
    expect(parseAmount('item a 10.00\nitem b 45.25\nitem c 5.00')).toBe(45.25)
  })
  it('returns null when there are no money-shaped values', () => {
    expect(parseAmount('no prices here')).toBeNull()
  })
  it('handles thousands separators', () => {
    expect(parseAmount('Grand Total 1,250.00')).toBe(1250)
  })
  it('ignores bare ids/years and picks the currency-shaped amount in the fallback', () => {
    expect(parseAmount('PO 12345\nInvoice 2026\n$89.99')).toBe(89.99)
  })
  it('reads a "Please pay" total even without the word "total"', () => {
    expect(parseAmount('Account 100200\nPlease pay $4,800.00 by Friday')).toBe(4800)
  })
})

describe('parseDate', () => {
  it('parses mm/dd/yyyy to ISO', () => {
    expect(parseDate(RECEIPT)).toBe('2026-04-17')
  })
  it('parses ISO dates directly', () => {
    expect(parseDate('Date: 2025-12-09')).toBe('2025-12-09')
  })
  it('expands two-digit years', () => {
    expect(parseDate('1/2/26')).toBe('2026-01-02')
  })
  it('rejects impossible month/day', () => {
    expect(parseDate('99/99/99')).toBeNull()
  })
  it('validates real calendar days, including leap years', () => {
    expect(normalizeReceiptDate('02/29/2024')).toBe('2024-02-29')
    expect(normalizeReceiptDate('02/29/2026')).toBeNull()
    expect(normalizeReceiptDate('April 31, 2026')).toBeNull()
  })
  it('prefers a labeled invoice date even when the due date appears first', () => {
    expect(parseDate('Due Date: 06/11/2026\nInvoice Date: 05/12/2026')).toBe('2026-05-12')
  })
})

describe('strict amount validation', () => {
  it('rejects negatives, malformed grouping, exponents, zero, and huge values', () => {
    expect(normalizeReceiptAmount('-12.00')).toBeNull()
    expect(normalizeReceiptAmount('1,23.45')).toBeNull()
    expect(normalizeReceiptAmount('1e5')).toBeNull()
    expect(normalizeReceiptAmount(0)).toBeNull()
    expect(normalizeReceiptAmount('100,000,001.00')).toBeNull()
  })
  it('does not recover a misleading positive substring from a negative or malformed total', () => {
    expect(parseAmount('Grand Total -$1,200.00')).toBeNull()
    expect(parseAmount('Grand Total $1,23.45')).toBeNull()
  })
})

describe('parseVendor', () => {
  it('takes the first substantial text line', () => {
    expect(parseVendor(RECEIPT)).toBe('HOME DEPOT')
  })
  it('skips a leading date line', () => {
    expect(parseVendor('04/17/2026\nACME SUPPLY')).toBe('ACME SUPPLY')
  })
  it('returns null when nothing looks like a name', () => {
    expect(parseVendor('12.00\n34\n  ')).toBeNull()
  })
  it('skips the "INVOICE" title and address, picks the business name', () => {
    expect(parseVendor('INVOICE\nAcme Construction LLC\n123 Main St\nDate: 06/01/2026')).toBe('Acme Construction LLC')
  })
  it('falls back to an email/website domain when no line qualifies', () => {
    expect(parseVendor('Order #5\nbilling@acme-supply.com\n$10.00 99887')).toBe('Acme Supply')
  })
})

describe('parseAmount on invoices', () => {
  it('treats "Balance Due" as the total', () => {
    expect(parseAmount(INVOICE)).toBe(3550.0)
  })
})

describe('parseInvoiceNumber', () => {
  it('reads a labelled "Invoice #:" value', () => {
    expect(parseInvoiceNumber(INVOICE)).toBe('INV-20841')
  })
  it('reads "Invoice No." with a letter-number ref', () => {
    expect(parseInvoiceNumber('Invoice No. A-1024')).toBe('A-1024')
  })
  it('reads a bare INV-#### token', () => {
    expect(parseInvoiceNumber('Thank you\nINV-7781\n')).toBe('INV-7781')
  })
  it('ignores prose with no number', () => {
    expect(parseInvoiceNumber('invoice attached for your records')).toBeNull()
  })
})

describe('parseDueDate', () => {
  it('parses the date on a "Due Date" line (not the invoice date)', () => {
    expect(parseDueDate(INVOICE)).toBe('2026-06-11')
    expect(parseDate(INVOICE)).toBe('2026-05-12')
  })
  it('parses a "Net 30" style due line', () => {
    expect(parseDueDate('Terms: Net 30  6/15/26')).toBe('2026-06-15')
  })
  it('returns null when a due line carries no date', () => {
    expect(parseDueDate('Amount due 500.00')).toBeNull()
  })
  it('returns null on a plain receipt', () => {
    expect(parseDueDate(RECEIPT)).toBeNull()
  })
})

describe('looksLikeInvoice', () => {
  it('is true when an invoice number is present', () => {
    expect(looksLikeInvoice({ invoiceNumber: 'INV-1', dueDate: null, raw: '' })).toBe(true)
  })
  it('is true when a due date is present', () => {
    expect(looksLikeInvoice({ invoiceNumber: null, dueDate: '2026-06-11', raw: '' })).toBe(true)
  })
  it('is true when the word "invoice" appears', () => {
    expect(looksLikeInvoice({ invoiceNumber: null, dueDate: null, raw: 'Tax INVOICE' })).toBe(true)
  })
  it('is false for a plain receipt', () => {
    expect(looksLikeInvoice({ invoiceNumber: null, dueDate: null, raw: RECEIPT })).toBe(false)
  })
  it('uses an explicit structured classification before keyword heuristics', () => {
    expect(looksLikeInvoice({ documentType: 'receipt', invoiceNumber: null, dueDate: null, raw: 'invoice copy' })).toBe(false)
    expect(looksLikeInvoice({ documentType: 'invoice', invoiceNumber: null, dueDate: null, raw: '' })).toBe(true)
  })
})

interface AiFixtureOptions {
  documentType?: 'receipt' | 'invoice' | 'unknown'
  vendor?: string | null
  amount?: number | null
  date?: string | null
  invoiceNumber?: string | null
  dueDate?: string | null
  vendorConfidence?: number
  amountConfidence?: number
  dateConfidence?: number
}

function aiFixture({
  documentType = 'receipt',
  vendor = 'ACME SUPPLY',
  amount = 23,
  date = '2026-04-17',
  invoiceNumber = null,
  dueDate = null,
  vendorConfidence = 0.95,
  amountConfidence = 0.95,
  dateConfidence = 0.95,
}: AiFixtureOptions = {}) {
  const field = (value: string | number | null, confidence: number) => ({
    value,
    confidence: value == null ? 0 : confidence,
    evidence: value == null ? null : String(value),
  })
  const result = parseServerOcrResponse({
    documentType,
    documentTypeConfidence: documentType === 'unknown' ? 0 : 0.96,
    fields: {
      vendor: field(vendor, vendorConfidence),
      amount: field(amount, amountConfidence),
      date: field(date, dateConfidence),
      invoiceNumber: field(invoiceNumber, 0.93),
      dueDate: field(dueDate, 0.93),
    },
  })
  if (!result) throw new Error('invalid AI fixture')
  return result
}

describe('structured OCR response parsing', () => {
  it('preserves confidence/evidence metadata and flags invalid model values', () => {
    const scan = parseServerOcrResponse({
      documentType: 'invoice',
      documentTypeConfidence: 0.9,
      fields: {
        vendor: { value: 'Acme Electric LLC', confidence: 0.96, evidence: 'ACME ELECTRIC LLC' },
        amount: { value: -400, confidence: 0.99, evidence: 'Amount due -400' },
        date: { value: '2026-02-29', confidence: 0.99, evidence: 'Date 02/29/2026' },
        invoiceNumber: { value: 'INV-808', confidence: 0.88, evidence: 'Invoice # INV-808' },
        dueDate: { value: '2026-06-30', confidence: 0.91, evidence: 'Due 06/30/2026' },
      },
    })
    expect(scan?.vendor).toBe('Acme Electric LLC')
    expect(scan?.amount).toBeNull()
    expect(scan?.date).toBeNull()
    expect(scan?.fields.invoiceNumber.source).toBe('ai')
    expect(scan?.fields.invoiceNumber.evidence).toBe('Invoice # INV-808')
    expect(scan?.needsReview).toEqual(expect.arrayContaining(['amount', 'date']))
  })

  it('accepts legacy flat responses conservatively so local OCR supplements them', () => {
    const scan = parseServerOcrResponse({ vendor: 'Legacy Store', amount: 19.5, date: '2026-04-10' })
    expect(scan?.fields.amount.confidence).toBe(0.5)
    expect(scan?.fields.amount.needsReview).toBe(true)
    expect(shouldSupplementWithLocal(scan)).toBe(true)
  })
})

describe('local scan and hybrid merge', () => {
  const LOCAL_RECEIPT = `ACME SUPPLY
Date: 04/17/2026
Grand Total $23.00
VISA ****4242`

  it('exposes document classification, field confidence, sources, and review metadata', () => {
    const scan = scanLocalText(LOCAL_RECEIPT, 92)
    expect(scan.documentType).toBe('receipt')
    expect(scan.fields.amount.source).toBe('local')
    expect(scan.fields.amount.confidence).toBeGreaterThan(0.82)
    expect(scan.needsReview).not.toContain('amount')
    expect(scan.extraction.usedLocalOcr).toBe(true)
  })

  it('fills a missing AI amount from local OCR instead of returning early', () => {
    const merged = mergeReceiptScans(aiFixture({ amount: null }), scanLocalText(LOCAL_RECEIPT, 100))
    expect(merged.amount).toBe(23)
    expect(merged.fields.amount.source).toBe('local')
    expect(merged.extraction).toMatchObject({ usedAi: true, usedLocalOcr: true })
  })

  it('boosts confidence when AI and local OCR agree', () => {
    const ai = aiFixture({ amountConfidence: 0.85 })
    const merged = mergeReceiptScans(ai, scanLocalText(LOCAL_RECEIPT, 100))
    expect(merged.fields.amount.source).toBe('both')
    expect(merged.fields.amount.confidence).toBeGreaterThan(0.85)
    expect(merged.needsReview).not.toContain('amount')
  })

  it('lets a clearly stronger local candidate replace low-confidence AI', () => {
    const merged = mergeReceiptScans(
      aiFixture({ amount: 12, amountConfidence: 0.45 }),
      scanLocalText(LOCAL_RECEIPT, 100),
    )
    expect(merged.amount).toBe(23)
    expect(merged.fields.amount.source).toBe('local')
    expect(merged.needsReview).toContain('amount')
    expect(merged.warnings).toContain('amount_conflict')
  })

  it('keeps high-confidence AI on conflict but always makes the conflict reviewable', () => {
    const merged = mergeReceiptScans(
      aiFixture({ amount: 12, amountConfidence: 0.97 }),
      scanLocalText(LOCAL_RECEIPT, 100),
    )
    expect(merged.amount).toBe(12)
    expect(merged.fields.amount.source).toBe('ai')
    expect(merged.fields.amount.needsReview).toBe(true)
    expect(merged.warnings).toContain('amount_conflict')
  })

  it('skips local OCR only for a confidently complete receipt', () => {
    expect(shouldSupplementWithLocal(aiFixture())).toBe(false)
    expect(shouldSupplementWithLocal(aiFixture({ vendor: null }))).toBe(true)
    expect(shouldSupplementWithLocal(aiFixture({ documentType: 'unknown' }))).toBe(true)
  })
})

describe('image sizing', () => {
  it('preserves aspect ratio and never upscales', () => {
    expect(fitImageDimensions(4032, 3024)).toEqual({ width: 2048, height: 1536, scale: 2048 / 4032 })
    expect(fitImageDimensions(800, 600)).toEqual({ width: 800, height: 600, scale: 1 })
  })
  it('fails safely for invalid dimensions', () => {
    expect(fitImageDimensions(0, Number.NaN)).toEqual({ width: 1, height: 1, scale: 1 })
  })
})
