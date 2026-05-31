import { describe, it, expect } from 'vitest'
import { crc32, makeZip } from './zip'

const u8 = (s: string) => new TextEncoder().encode(s)
const view = (buf: ArrayBuffer) => new DataView(buf)

describe('crc32', () => {
  it('matches the standard check vector for "123456789"', () => {
    expect(crc32(u8('123456789')) >>> 0).toBe(0xcbf43926)
  })
  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('makeZip', () => {
  it('produces a valid store-method archive with EOCD and correct entry count', async () => {
    const blob = makeZip([
      { name: 'a.txt', data: u8('hello') },
      { name: 'b.json', data: u8('{"x":1}') },
    ])
    expect(blob.type).toBe('application/zip')
    const buf = await blob.arrayBuffer()
    const dv = view(buf)
    // First bytes are a local file header signature.
    expect(dv.getUint32(0, true)).toBe(0x04034b50)
    // The End Of Central Directory record sits in the last 22 bytes.
    const eocd = buf.byteLength - 22
    expect(dv.getUint32(eocd, true)).toBe(0x06054b50)
    expect(dv.getUint16(eocd + 8, true)).toBe(2) // entries on disk
    expect(dv.getUint16(eocd + 10, true)).toBe(2) // total entries
  })

  it('stores the uncompressed bytes verbatim (method 0)', async () => {
    const payload = u8('stored-verbatim')
    const buf = await makeZip([{ name: 'f', data: payload }]).arrayBuffer()
    const dv = view(buf)
    expect(dv.getUint16(8, true)).toBe(0) // compression method = store
    const nameLen = dv.getUint16(26, true)
    const dataStart = 30 + nameLen
    const stored = new Uint8Array(buf.slice(dataStart, dataStart + payload.length))
    expect(Array.from(stored)).toEqual(Array.from(payload))
  })
})
