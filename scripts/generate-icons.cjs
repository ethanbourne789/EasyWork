const sharp = require("sharp")
const fs = require("fs")
const path = require("path")

const ICONS_DIR = path.join(__dirname, "..", "src-tauri", "icons")
const LOGO_PATH = path.join(__dirname, "..", "logo.png")

async function main() {
  fs.mkdirSync(ICONS_DIR, { recursive: true })

  // Resize logo to all required sizes
  const sizes = [32, 128, 256]
  for (const size of sizes) {
    const outPath = path.join(ICONS_DIR, `${size}x${size}.png`)
    await sharp(LOGO_PATH).resize(size, size).png().toFile(outPath)
    console.log(`Created ${outPath}`)
  }

  // Copy 128 as 128x128@2x (Tauri convention)
  fs.copyFileSync(
    path.join(ICONS_DIR, "256x256.png"),
    path.join(ICONS_DIR, "128x128@2x.png")
  )
  console.log("Created 128x128@2x.png (from 256)")

  // Create ICO (multi-size: 32 + 256 embedded)
  const ico32 = await sharp(LOGO_PATH).resize(32, 32).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const ico256 = await sharp(LOGO_PATH).resize(256, 256).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  // Build ICO file manually
  // ICO header: 6 bytes
  // Then for each image: 16-byte entry + image data (BMP with alpha = PNG in newer formats)
  // We'll embed as PNG inside ICO (Vista+ format)
  
  const png32 = await sharp(LOGO_PATH).resize(32, 32).png().toBuffer()
  const png256 = await sharp(LOGO_PATH).resize(256, 256).png().toBuffer()

  // ICO header: reserved(2) + type=1(2) + count(2) = 6 bytes
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)  // reserved
  header.writeUInt16LE(1, 2)  // type: ICO
  header.writeUInt16LE(2, 4)  // count: 2 images

  // Directory entry: 16 bytes each
  function makeEntry(w, h, offset, size) {
    const buf = Buffer.alloc(16)
    buf.writeUInt8(w >= 256 ? 0 : w, 0) // width
    buf.writeUInt8(h >= 256 ? 0 : h, 1) // height
    buf.writeUInt8(0, 2)    // color palette
    buf.writeUInt8(0, 3)    // reserved
    buf.writeUInt16LE(1, 4) // color planes
    buf.writeUInt16LE(32, 6) // bits per pixel
    buf.writeUInt32LE(size, 8)  // image size
    buf.writeUInt32LE(offset, 12) // offset (from start of file)
    return buf
  }

  const entryOffset = 6 + 32 // header + 2 entries
  const entry1 = makeEntry(32, 32, entryOffset, png32.length)
  const entry2 = makeEntry(0, 0, entryOffset + png32.length, png256.length) // 0,0 = 256x256

  const ico = Buffer.concat([header, entry1, entry2, png32, png256])
  fs.writeFileSync(path.join(ICONS_DIR, "icon.ico"), ico)
  console.log(`Created icon.ico (${ico.length} bytes, 32x32 + 256x256 PNGs)`)

  // Also copy 256 as icon.icns placeholder (Tauri needs it for macOS builds)
  fs.copyFileSync(
    path.join(ICONS_DIR, "256x256.png"),
    path.join(ICONS_DIR, "icon.icns")
  )
  console.log("Created icon.icns (PNG placeholder)")
}

main().catch(console.error)
