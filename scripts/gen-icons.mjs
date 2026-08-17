// Regenerate every launcher icon asset from a single square source image.
//
//   node scripts/gen-icons.mjs <source.png|source.ico> [outDir]
//
// Defaults to `assets/branding/xmclf-logo.png` -> `xmcl-electron-app/icons`.
//
// The `light@*` family is the source artwork (dark badge, shown on light
// backgrounds) and the `dark@*` family is its luminance inverse (light badge,
// shown on dark backgrounds), which is the same convention upstream uses.
//
// No image dependency is installed at the repo root, so PNG decode/encode and
// resampling are done here directly.

import { deflateSync, inflateSync } from 'zlib'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// #region PNG

/** @typedef {{ width: number, height: number, data: Buffer }} Image RGBA8 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

/** @returns {Image} */
function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG')

  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  /** @type {Buffer | undefined} */
  let palette
  /** @type {Buffer | undefined} */
  let paletteAlpha
  const idat = []

  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const body = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length

    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      bitDepth = body[8]
      colorType = body[9]
      interlace = body[12]
    } else if (type === 'PLTE') palette = Buffer.from(body)
    else if (type === 'tRNS') paletteAlpha = Buffer.from(body)
    else if (type === 'IDAT') idat.push(body)
    else if (type === 'IEND') break
  }

  if (bitDepth !== 8) throw new Error(`Unsupported bit depth ${bitDepth}, expected 8`)
  if (interlace !== 0) throw new Error('Interlaced PNG is not supported')

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`Unsupported color type ${colorType}`)

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const scanlines = Buffer.alloc(height * stride)

  // Undo the per-scanline filters (PNG spec 9.2).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const line = scanlines.subarray(y * stride, (y + 1) * stride)
    const prior = y > 0 ? scanlines.subarray((y - 1) * stride, y * stride) : undefined

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels] : 0
      const b = prior ? prior[x] : 0
      const c = prior && x >= channels ? prior[x - channels] : 0
      let value = src[x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new Error(`Unknown filter ${filter}`)
      line[x] = value & 0xFF
    }
  }

  const data = Buffer.alloc(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const s = i * channels
    const d = i * 4
    if (colorType === 0) data.fill(scanlines[s], d, d + 3), data[d + 3] = 255
    else if (colorType === 4) data.fill(scanlines[s], d, d + 3), data[d + 3] = scanlines[s + 1]
    else if (colorType === 2) {
      scanlines.copy(data, d, s, s + 3)
      data[d + 3] = 255
    } else if (colorType === 6) scanlines.copy(data, d, s, s + 4)
    else {
      const index = scanlines[s]
      if (!palette) throw new Error('Indexed PNG without a palette')
      palette.copy(data, d, index * 3, index * 3 + 3)
      data[d + 3] = paletteAlpha?.[index] ?? 255
    }
  }

  return { width, height, data }
}

function chunk(type, body) {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(body.length, 0)
  head.write(type, 4, 'ascii')
  const crcTable = (chunk.table ||= Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  }))
  let crc = 0xFFFFFFFF
  for (const byte of Buffer.concat([head.subarray(4), body])) {
    crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  }
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE((crc ^ 0xFFFFFFFF) >>> 0, 0)
  return Buffer.concat([head, body, tail])
}

/** @param {Image} image */
function encodePng({ width, height, data }) {
  const stride = width * 4
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0 // filter: none, deflate handles the rest well enough
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// #endregion

// #region resampling

/**
 * Area-average resample. Exact for downscaling and degrades to bilinear-ish
 * smoothing when upscaling. Alpha-weighted so transparent edges do not bleed
 * black into the result.
 * @param {Image} image
 * @returns {Image}
 */
function resize(image, width, height) {
  const { width: sw, height: sh, data: src } = image
  const out = Buffer.alloc(width * height * 4)
  const scaleX = sw / width
  const scaleY = sh / height

  for (let y = 0; y < height; y++) {
    const y0 = y * scaleY
    const y1 = (y + 1) * scaleY
    for (let x = 0; x < width; x++) {
      const x0 = x * scaleX
      const x1 = (x + 1) * scaleX
      let r = 0, g = 0, b = 0, a = 0, weight = 0

      for (let sy = Math.floor(y0); sy < Math.min(Math.ceil(y1), sh); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        for (let sx = Math.floor(x0); sx < Math.min(Math.ceil(x1), sw); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          const w = wx * wy
          const i = (sy * sw + sx) * 4
          const alpha = src[i + 3] / 255
          r += src[i] * alpha * w
          g += src[i + 1] * alpha * w
          b += src[i + 2] * alpha * w
          a += src[i + 3] * w
          weight += w
        }
      }

      const d = (y * width + x) * 4
      const opaque = a / 255
      out[d] = opaque > 0 ? Math.round(r / opaque) : 0
      out[d + 1] = opaque > 0 ? Math.round(g / opaque) : 0
      out[d + 2] = opaque > 0 ? Math.round(b / opaque) : 0
      out[d + 3] = Math.round(a / weight)
    }
  }

  return { width, height, data: out }
}

/**
 * Fit `image` inside a transparent canvas, centered, keeping the aspect ratio.
 * @param {Image} image
 * @returns {Image}
 */
function fit(image, width, height, padding = 0) {
  const box = Math.min(width * (1 - padding), height * (1 - padding))
  const scale = box / Math.max(image.width, image.height)
  const inner = resize(image, Math.round(image.width * scale), Math.round(image.height * scale))

  const data = Buffer.alloc(width * height * 4)
  const offsetX = Math.round((width - inner.width) / 2)
  const offsetY = Math.round((height - inner.height) / 2)
  for (let y = 0; y < inner.height; y++) {
    inner.data.copy(
      data,
      ((y + offsetY) * width + offsetX) * 4,
      y * inner.width * 4,
      (y + 1) * inner.width * 4,
    )
  }
  return { width, height, data }
}

/**
 * Invert RGB, preserve alpha. Turns the dark badge into a light one.
 * @param {Image} image
 * @returns {Image}
 */
function invert({ width, height, data }) {
  const out = Buffer.from(data)
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 255 - out[i]
    out[i + 1] = 255 - out[i + 1]
    out[i + 2] = 255 - out[i + 2]
  }
  return { width, height, data: out }
}

// #endregion

// #region containers

/**
 * ICO with BMP entries below 256px (widest compatibility) and a PNG entry at
 * 256px (the only way to keep the file small).
 * @param {Image} image
 */
function encodeIco(image, sizes = [16, 24, 32, 48, 64, 128, 256]) {
  const entries = sizes.map((size) => {
    const scaled = resize(image, size, size)
    if (size >= 256) return { size, body: encodePng(scaled), png: true }

    // BITMAPINFOHEADER + BGRA rows, bottom-up, followed by the (unused, but
    // required) AND mask padded to 4-byte rows.
    const header = Buffer.alloc(40)
    header.writeUInt32LE(40, 0)
    header.writeInt32LE(size, 4)
    header.writeInt32LE(size * 2, 8) // image + mask
    header.writeUInt16LE(1, 12)
    header.writeUInt16LE(32, 14)
    header.writeUInt32LE(size * size * 4, 20)

    const pixels = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const s = ((size - 1 - y) * size + x) * 4
        const d = (y * size + x) * 4
        pixels[d] = scaled.data[s + 2]
        pixels[d + 1] = scaled.data[s + 1]
        pixels[d + 2] = scaled.data[s]
        pixels[d + 3] = scaled.data[s + 3]
      }
    }

    const maskStride = Math.ceil(size / 32) * 4
    return { size, body: Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]), png: false }
  })

  const header = Buffer.alloc(6)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(entries.length, 4)

  const directory = Buffer.alloc(entries.length * 16)
  let offset = 6 + directory.length
  entries.forEach((entry, i) => {
    const at = i * 16
    directory[at] = entry.size >= 256 ? 0 : entry.size
    directory[at + 1] = entry.size >= 256 ? 0 : entry.size
    directory.writeUInt16LE(1, at + 4)
    directory.writeUInt16LE(32, at + 6)
    directory.writeUInt32LE(entry.body.length, at + 8)
    directory.writeUInt32LE(offset, at + 12)
    offset += entry.body.length
  })

  return Buffer.concat([header, directory, ...entries.map((e) => e.body)])
}

/** ICNS carrying PNG payloads, which macOS 10.7+ reads for every type below. */
function encodeIcns(image) {
  const types = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]
  const bodies = types.map(([type, size]) => {
    const png = encodePng(resize(image, size, size))
    const head = Buffer.alloc(8)
    head.write(type, 0, 'ascii')
    head.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([head, png])
  })
  const total = 8 + bodies.reduce((sum, b) => sum + b.length, 0)
  const head = Buffer.alloc(8)
  head.write('icns', 0, 'ascii')
  head.writeUInt32BE(total, 4)
  return Buffer.concat([head, ...bodies])
}

// #endregion

/** Pull the largest image out of an .ico so the source may be either format. */
function decodeIco(buffer) {
  const count = buffer.readUInt16LE(4)
  let best
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 16
    const size = buffer[at] || 256
    const offset = buffer.readUInt32LE(at + 12)
    const length = buffer.readUInt32LE(at + 8)
    if (!best || size > best.size) best = { size, body: buffer.subarray(offset, offset + length) }
  }
  if (!best) throw new Error('Empty ICO')
  if (!best.body.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('ICO entry is a BMP; please pass a PNG source instead')
  }
  return decodePng(best.body)
}

const source = process.argv[2] || join(root, 'assets/branding/xmclf-logo.png')
const outDir = process.argv[3] || join(root, 'xmcl-electron-app/icons')

const raw = readFileSync(source)
const logo = raw.subarray(0, 8).equals(PNG_SIGNATURE) ? decodePng(raw) : decodeIco(raw)
console.log(`source ${source} (${logo.width}x${logo.height})`)

mkdirSync(outDir, { recursive: true })

/** name -> [width, height, padding] of every asset the build expects. */
const tiles = {
  '@256x256.png': [256, 256, 0],
  '@tray.png': [32, 32, 0],
  '@SmallTile.png': [71, 71, 0.1],
  '@SmallTile.scale-400.png': [284, 284, 0.1],
  '@Square150x150Logo.png': [150, 150, 0.2],
  '@Square150x150Logo.scale-400.png': [600, 600, 0.2],
  '@Square44x44Logo.png': [44, 44, 0.1],
  '@Square44x44Logo.targetsize-256.png': [256, 256, 0.1],
  '@StoreLogo.png': [50, 50, 0.1],
  '@StoreLogo.scale-400.png': [200, 200, 0.1],
}

let written = 0
const write = (name, buffer) => {
  writeFileSync(join(outDir, name), buffer)
  written++
}

// Everything after the `@` becomes the literal appx asset filename (see the
// `artifactBuildStarted` hook in xmcl-electron-app/build.ts), so the
// `theme-light` qualifier has to follow appx naming: the first qualifier is
// joined to the base name with `.`, any further one with `_`.
const themeLight = (base) => {
  const stem = base.endsWith('.png') ? base.slice(0, -4) : base
  const tail = base.endsWith('.png') ? '.png' : ''
  return `${stem}${stem.includes('.') ? '_' : '.'}theme-light${tail}`
}

for (const [theme, art] of [['light', logo], ['dark', invert(logo)]]) {
  const named = (base) => {
    if (theme === 'dark') return `dark${base}`
    // The app itself loads `light@256x256.png` / `light@tray.png` by name;
    // those are not appx assets and take no qualifier.
    if (base === '@256x256.png' || base === '@tray.png') return `light${base}`
    return `light${themeLight(base)}`
  }

  for (const [base, [width, height, padding]] of Object.entries(tiles)) {
    write(named(base), encodePng(fit(art, width, height, padding)))
  }

  // Unplated variants drop the platform-drawn backplate; same art, other name.
  write(
    theme === 'dark'
      ? 'dark@Square44x44Logo.targetsize-256_altform-unplated.png'
      : 'light@Square44x44Logo.targetsize-256_altform-lightunplated.png',
    encodePng(fit(art, 256, 256, 0.1)),
  )

  // `large-` / `wide-` only keep the repo-side filenames unique; the appx asset
  // name starts after the `@`.
  for (const [width, height, name] of [
    [310, 310, 'LargeTile.png'],
    [620, 620, 'LargeTile.scale-200.png'],
  ]) {
    const file = theme === 'dark' ? `large-dark@${name}` : `large-light@${themeLight(name)}`
    write(file, encodePng(fit(art, width, height, 0.25)))
  }

  for (const [width, height, name] of [
    [310, 150, 'Wide310x150Logo.png'],
    [465, 225, 'Wide310x150Logo.scale-150.png'],
    [620, 300, 'Wide310x150Logo.scale-200.png'],
    [1240, 600, 'Wide310x150Logo.scale-400.png'],
  ]) {
    const file = theme === 'dark' ? `wide-dark@${name}` : `wide-light@${themeLight(name)}`
    write(file, encodePng(fit(art, width, height, 0.15)))
  }

  write(`${theme}.ico`, encodeIco(art))
  write(`${theme}.icns`, encodeIcns(art))
}

console.log(`wrote ${written} files to ${outDir}`)
