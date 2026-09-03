// 極簡 PNG 編碼器。
// 為什麼不用 SVG：64×64 的一格有 4096 個像素，8×8 格就是二十六萬個。
// 用 <rect>/<path> 描述會膨脹到幾百 KB；PNG 壓完只有幾十 KB，
// 而且 sprite sheet 本來就該是點陣圖。
const zlib = require('node:zlib')

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

// pixels: 高 × 寬 的陣列，每格是 '#rrggbb' 或 null（透明）
function encodePNG(pixels) {
  const height = pixels.length
  const width = pixels[0].length
  // 每列前面要加一個 filter byte（0 = None）
  const raw = Buffer.alloc(height * (1 + width * 4))
  let o = 0
  for (let y = 0; y < height; y += 1) {
    raw[o] = 0
    o += 1
    for (let x = 0; x < width; x += 1) {
      const c = pixels[y][x]
      if (!c) {
        raw[o] = 0; raw[o + 1] = 0; raw[o + 2] = 0; raw[o + 3] = 0
      } else {
        raw[o] = parseInt(c.slice(1, 3), 16)
        raw[o + 1] = parseInt(c.slice(3, 5), 16)
        raw[o + 2] = parseInt(c.slice(5, 7), 16)
        raw[o + 3] = 255
      }
      o += 4
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8    // bit depth
  ihdr[9] = 6    // colour type: RGBA
  ihdr[10] = 0   // compression
  ihdr[11] = 0   // filter
  ihdr[12] = 0   // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

module.exports = { encodePNG }
