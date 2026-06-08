import { describe, it, expect } from 'vitest'
import {
  parseAmount,
  parseDate,
  parseVendor,
  parseInvoiceNumber,
  parseDueDate,
  looksLikeInvoice,
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
})
