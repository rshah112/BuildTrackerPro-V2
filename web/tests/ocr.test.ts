import { describe, expect, it } from 'vitest'
import { jsPDF } from 'jspdf'
import { extractText as extractPdfText, getDocumentProxy } from 'unpdf'
import {
  OCR_JSON_SCHEMA,
  OcrInputError,
  calculatePdfRenderWidth,
  createOcrRateLimiter,
  detectFileType,
  limitPdfText,
  mergeStructuredOcrResults,
  modelPayload,
  normalizeOcrAmount,
  normalizeOcrDate,
  normalizePdfText,
  parseDistributedQuotaDecision,
  parseStructuredOcr,
  renderedPdfPageBase64,
  renderPdfFirstPageForVision,
  shouldRetryOcrWithPdfVision,
  shouldUsePdfVision,
  validateOcrInput,
} from '../api/ocr'

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const WEBP = new Uint8Array(Buffer.from('RIFF0000WEBP', 'ascii'))
const PDF = new Uint8Array(Buffer.from('%PDF-1.7\n1 0 obj\n', 'ascii'))
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

describe('strict OCR field normalization', () => {
  it('accepts real dates and rejects rollover dates', () => {
    expect(normalizeOcrDate('2024-02-29')).toBe('2024-02-29')
    expect(normalizeOcrDate('Feb 29, 2026')).toBeNull()
    expect(normalizeOcrDate('2026-04-31')).toBeNull()
    expect(normalizeOcrDate('06/01/26')).toBe('2026-06-01')
  })

  it('accepts positive cents and rejects unsafe amount shapes', () => {
    expect(normalizeOcrAmount('$1,250.25')).toBe(1250.25)
    expect(normalizeOcrAmount(19.999)).toBe(20)
    expect(normalizeOcrAmount('-12.00')).toBeNull()
    expect(normalizeOcrAmount('(12.00)')).toBeNull()
    expect(normalizeOcrAmount('1,25.00')).toBeNull()
    expect(normalizeOcrAmount('1e6')).toBeNull()
    expect(normalizeOcrAmount(100_000_001)).toBeNull()
  })
})

describe('document input validation', () => {
  it('detects supported magic bytes', () => {
    expect(detectFileType(JPEG)).toBe('image/jpeg')
    expect(detectFileType(PNG)).toBe('image/png')
    expect(detectFileType(WEBP)).toBe('image/webp')
    expect(detectFileType(PDF)).toBe('application/pdf')
    expect(detectFileType(new Uint8Array([1, 2, 3, 4]))).toBeNull()
  })

  it.each([
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP],
    ['application/pdf', PDF],
  ])('accepts canonical base64 when MIME and bytes agree (%s)', (contentType, bytes) => {
    const result = validateOcrInput({ data: base64(bytes), contentType })
    expect(result.contentType).toBe(contentType)
    expect(result.bytes).toEqual(bytes)
  })

  it('rejects spoofed MIME, data URLs, malformed base64, unsupported types, and oversize input', () => {
    expect(() => validateOcrInput({ data: base64(PNG), contentType: 'image/jpeg' })).toThrow(OcrInputError)
    expect(() =>
      validateOcrInput({ data: `data:image/png;base64,${base64(PNG)}`, contentType: 'image/png' }),
    ).toThrow('document is too large')
    expect(() => validateOcrInput({ data: 'not/base64!', contentType: 'image/png' })).toThrow(
      'invalid document encoding',
    )
    expect(() => validateOcrInput({ data: base64(PNG), contentType: 'image/gif' })).toThrow(
      'unsupported document type',
    )
    expect(() => validateOcrInput({ data: base64(PNG), contentType: 'image/png' }, 4)).toThrow(
      'document is too large',
    )
  })
})

describe('structured response parsing', () => {
  const valid = {
    documentType: 'invoice',
    documentTypeConfidence: 0.94,
    fields: {
      vendor: { value: 'ACME ELECTRIC LLC', confidence: 0.96, evidence: 'ACME ELECTRIC LLC' },
      amount: { value: 4200.5, confidence: 0.93, evidence: 'Balance Due $4,200.50' },
      date: { value: '2026-05-12', confidence: 0.9, evidence: 'Invoice Date 05/12/2026' },
      invoiceNumber: { value: 'INV-20841', confidence: 0.91, evidence: 'Invoice # INV-20841' },
      dueDate: { value: '2026-06-11', confidence: 0.88, evidence: 'Due Date 06/11/2026' },
    },
  }

  it('accepts JSON-mode objects and exposes per-field evidence/confidence', () => {
    const parsed = parseStructuredOcr(valid)
    expect(parsed).toMatchObject({
      documentType: 'invoice',
      vendor: 'ACME ELECTRIC LLC',
      amount: 4200.5,
      date: '2026-05-12',
      invoiceNumber: 'INV-20841',
      dueDate: '2026-06-11',
    })
    expect(parsed?.fields.amount).toMatchObject({
      confidence: 0.93,
      evidence: 'Balance Due $4,200.50',
      source: 'ai',
      needsReview: false,
    })
  })

  it('recovers a JSON object from legacy fenced/prose output', () => {
    const parsed = parseStructuredOcr(`result follows\n\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``)
    expect(parsed?.invoiceNumber).toBe('INV-20841')
  })

  it('fails invalid high-confidence dates and amounts closed and marks required fields for review', () => {
    const parsed = parseStructuredOcr({
      ...valid,
      fields: {
        ...valid.fields,
        amount: { value: -500, confidence: 0.99, evidence: 'Balance Due -500' },
        date: { value: '2026-02-29', confidence: 0.99, evidence: 'Date 02/29/2026' },
      },
    })
    expect(parsed?.amount).toBeNull()
    expect(parsed?.date).toBeNull()
    expect(parsed?.needsReview).toEqual(expect.arrayContaining(['amount', 'date']))
  })

  it('uses vision for weak text passes and merges the strongest supported fields', () => {
    const textResult = parseStructuredOcr({
      ...valid,
      fields: {
        ...valid.fields,
        amount: { value: 4200.5, confidence: 0.6, evidence: 'Balance Due $4,200.50' },
      },
    })
    expect(shouldRetryOcrWithPdfVision(textResult)).toBe(true)
    expect(shouldRetryOcrWithPdfVision(parseStructuredOcr(valid))).toBe(false)

    const visionResult = parseStructuredOcr({
      ...valid,
      fields: {
        ...valid.fields,
        vendor: { value: 'ACME', confidence: 0.8, evidence: 'ACME' },
        amount: { value: 4250.5, confidence: 0.98, evidence: 'Total $4,250.50' },
      },
    })
    const merged = mergeStructuredOcrResults(textResult, visionResult)
    expect(merged?.vendor).toBe('ACME ELECTRIC LLC')
    expect(merged?.amount).toBe(4250.5)
  })
})

describe('Cloudflare payload contract', () => {
  it('sends raw base64 plus top-level JSON schema, never a data URL', () => {
    const payload = modelPayload([{ role: 'user', content: 'extract' }], 'aGVsbG8=')
    expect(payload.image).toBe('aGVsbG8=')
    expect(payload.image).not.toMatch(/^data:/)
    expect(payload.response_format).toEqual({ type: 'json_schema', json_schema: OCR_JSON_SCHEMA })
  })
})

describe('PDF text normalization', () => {
  it('preserves useful line boundaries, removes controls, and joins wrapped hyphenation', () => {
    expect(normalizePdfText(['ACME\r\nconstruc-\n tion', '\u0000Grand   Total\t$25.00'])).toBe(
      'ACME\nconstruction\n\nGrand Total $25.00',
    )
  })

  it('keeps both the beginning and end when limiting a long document', () => {
    const limited = limitPdfText(`HEADER-${'x'.repeat(100)}-BALANCE-DUE`, 40)
    expect(limited).toContain('HEADER-')
    expect(limited).toContain('-BALANCE-DUE')
    expect(limited).toContain('[...middle omitted...]')
  })

  it('routes empty and incidental text layers to vision', () => {
    expect(shouldUsePdfVision('')).toBe(true)
    expect(shouldUsePdfVision('Page 1 ........ metadata only')).toBe(true)
    expect(
      shouldUsePdfVision(
        'ACME ELECTRIC LLC Invoice 4081 Invoice Date 2026-04-10 Grand Total $1,250.00 Balance Due $1,250.00',
      ),
    ).toBe(false)
  })

  it('caps page geometry before canvas allocation and validates rendered PNG bytes', () => {
    expect(calculatePdfRenderWidth(612, 792, 1600, 4_000_000)).toBe(1600)
    expect(calculatePdfRenderWidth(1000, 1000, 2000, 1_000_000)).toBe(1000)
    expect(calculatePdfRenderWidth(100, 10_000, 1600, 4_000_000)).toBeNull()
    expect(calculatePdfRenderWidth(0, 792)).toBeNull()

    const encoded = renderedPdfPageBase64(PNG.buffer.slice(0))
    expect(Buffer.from(encoded, 'base64')).toEqual(Buffer.from(PNG))
    expect(() => renderedPdfPageBase64(PNG.buffer.slice(0), 4)).toThrow('unsafe PDF preview')
    expect(() => renderedPdfPageBase64(new Uint8Array([1, 2, 3]).buffer)).toThrow('unsafe PDF preview')
  })

  it('renders the first page of an image-only PDF for the vision model', async () => {
    const document = new jsPDF({ unit: 'pt', format: 'letter' })
    document.setFillColor(20, 30, 40)
    document.rect(40, 40, 200, 120, 'F')
    const bytes = new Uint8Array(document.output('arraybuffer'))
    const pdf = await getDocumentProxy(bytes)
    try {
      const { text } = await extractPdfText(pdf, { mergePages: true })
      expect(shouldUsePdfVision(normalizePdfText(text))).toBe(true)
      const encoded = await renderPdfFirstPageForVision(pdf, 800, 1_000_000, 2_000_000)
      expect(detectFileType(new Uint8Array(Buffer.from(encoded, 'base64')))).toBe('image/png')
    } finally {
      await pdf.destroy?.()
    }
  }, 15_000)
})

describe('distributed OCR quota response', () => {
  it('accepts only well-formed allow/deny decisions and clamps retry delays', () => {
    expect(parseDistributedQuotaDecision({ ok: true, reason: null })).toEqual({ ok: true })
    expect(
      parseDistributedQuotaDecision([{ ok: false, reason: 'minute', retry_after_seconds: 10.2 }]),
    ).toEqual({ ok: false, reason: 'minute', retryAfterSeconds: 11 })
    expect(
      parseDistributedQuotaDecision({ ok: false, reason: 'bytes', retry_after_seconds: 999_999 }),
    ).toEqual({ ok: false, reason: 'bytes', retryAfterSeconds: 86_400 })
    expect(parseDistributedQuotaDecision({ ok: false, reason: 'unknown', retry_after_seconds: 10 })).toBeNull()
    expect(parseDistributedQuotaDecision({ ok: false, reason: 'day', retry_after_seconds: 'nope' })).toBeNull()
  })
})

describe('OCR budget limiter', () => {
  const start = Date.UTC(2026, 3, 10, 12)

  it('enforces per-minute request limits and resets the minute window', () => {
    const limiter = createOcrRateLimiter()
    const policy = { perMinute: 2, perDay: 20, dailyBytes: 1000 }
    expect(limiter.consume('u1', 10, start, policy).ok).toBe(true)
    expect(limiter.consume('u1', 10, start + 1, policy).ok).toBe(true)
    expect(limiter.consume('u1', 10, start + 2, policy)).toMatchObject({ ok: false, reason: 'minute' })
    expect(limiter.consume('u1', 10, start + 60_001, policy).ok).toBe(true)
  })

  it('enforces daily request and byte budgets per user', () => {
    const requestLimiter = createOcrRateLimiter()
    const requestPolicy = { perMinute: 10, perDay: 2, dailyBytes: 1000 }
    requestLimiter.consume('u1', 10, start, requestPolicy)
    requestLimiter.consume('u1', 10, start, requestPolicy)
    expect(requestLimiter.consume('u1', 10, start, requestPolicy)).toMatchObject({ ok: false, reason: 'day' })
    expect(requestLimiter.consume('u2', 10, start, requestPolicy).ok).toBe(true)

    const byteLimiter = createOcrRateLimiter()
    const bytePolicy = { perMinute: 10, perDay: 10, dailyBytes: 15 }
    expect(byteLimiter.consume('u1', 10, start, bytePolicy).ok).toBe(true)
    expect(byteLimiter.consume('u1', 6, start, bytePolicy)).toMatchObject({ ok: false, reason: 'bytes' })
  })
})
