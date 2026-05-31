// Generates the PWA / home-screen icons as real artwork (no image libraries): a bold white
// house glyph on a construction-orange gradient, antialiased via supersampling. Emits the
// manifest icons (192, 512, maskable-512) + apple-touch-icon (180). Re-run after edits:
//   node scripts/gen-icons.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0)
  return Buffer.concat([len, t, data, crc])
}
const lerp = (a, b, t) => a + (b - a) * t

// House glyph defined in its own [0,1] box.
function houseCoverage(nx, ny) {
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return 0
  const inRoof =
    ny >= 0.06 &&
    ny <= 0.42 &&
    (() => {
      const t = (ny - 0.06) / (0.42 - 0.06) // 0 at apex → 1 at eaves
      const halfW = lerp(0.0, 0.46, t)
      return nx >= 0.5 - halfW && nx <= 0.5 + halfW
    })()
  const inBody = ny >= 0.4 && ny <= 0.92 && nx >= 0.16 && nx <= 0.84
  if (!(inRoof || inBody)) return 0
  // cut-outs: door + two windows (show the background through)
  const inDoor = nx >= 0.42 && nx <= 0.58 && ny >= 0.62 && ny <= 0.92
  const inWin = ny >= 0.52 && ny <= 0.66 && ((nx >= 0.24 && nx <= 0.37) || (nx >= 0.63 && nx <= 0.76))
  if (inDoor || inWin) return 0
  return 1
}

function render(size, scale) {
  const off = (size * (1 - scale)) / 2
  const glyph = size * scale
  const SS = 3 // supersample for antialiased edges
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (1 + size * 4))
  const gridStep = Math.round(size / 8)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4)
    raw[rowStart] = 0 // filter: none
    const gt = y / size
    const bgR = lerp(226, 124, gt), bgG = lerp(101, 45, gt), bgB = lerp(30, 18, gt)
    for (let x = 0; x < size; x++) {
      const onGrid = x % gridStep === 0 || y % gridStep === 0
      let r = bgR, g = bgG, b = bgB
      if (onGrid) { r = lerp(r, 255, 0.06); g = lerp(g, 255, 0.06); b = lerp(b, 255, 0.06) }
      let cov = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          cov += houseCoverage((x + (sx + 0.5) / SS - off) / glyph, (y + (sy + 0.5) / SS - off) / glyph)
        }
      }
      cov /= SS * SS
      const o = rowStart + 1 + x * 4
      raw[o] = Math.round(lerp(r, 255, cov))
      raw[o + 1] = Math.round(lerp(g, 255, cov))
      raw[o + 2] = Math.round(lerp(b, 255, cov))
      raw[o + 3] = 255
    }
  }
  const idat = deflateSync(raw, { level: 9 })
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public/icons', { recursive: true })
writeFileSync('public/icons/icon-192.png', render(192, 0.74))
writeFileSync('public/icons/icon-512.png', render(512, 0.74))
writeFileSync('public/icons/maskable-512.png', render(512, 0.6)) // extra safe-zone padding
writeFileSync('public/apple-touch-icon.png', render(180, 0.74))
console.log('icons written: icon-192, icon-512, maskable-512, apple-touch-icon')
