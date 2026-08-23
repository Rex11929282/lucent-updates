// 用 Electron 離屏渲染把 logo.html 轉成 PNG，再打包成 .ico（Vista+ ICO 可直接內嵌 PNG）
const { app, BrowserWindow, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

const OUT = __dirname
const SIZES = [16, 24, 32, 48, 64, 128, 256]

function buildIco(pngBuffers) {
  const count = pngBuffers.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)      // reserved
  header.writeUInt16LE(1, 2)      // type: icon
  header.writeUInt16LE(count, 4)  // image count

  const entries = []
  let offset = 6 + count * 16
  pngBuffers.forEach(({ size, buf }) => {
    const e = Buffer.alloc(16)
    e.writeUInt8(size >= 256 ? 0 : size, 0) // width
    e.writeUInt8(size >= 256 ? 0 : size, 1) // height
    e.writeUInt8(0, 2)                      // palette
    e.writeUInt8(0, 3)                      // reserved
    e.writeUInt16LE(1, 4)                   // color planes
    e.writeUInt16LE(32, 6)                  // bpp
    e.writeUInt32LE(buf.length, 8)          // size
    e.writeUInt32LE(offset, 12)             // offset
    offset += buf.length
    entries.push(e)
  })
  return Buffer.concat([header, ...entries, ...pngBuffers.map((p) => p.buf)])
}

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 512, height: 512, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { offscreen: false },
  })
  await win.loadFile(path.join(__dirname, 'logo.html'))
  await new Promise((r) => setTimeout(r, 900))

  const shot = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 })
  fs.writeFileSync(path.join(OUT, 'icon.png'), shot.toPNG())

  const pngs = SIZES.map((size) => ({
    size,
    buf: shot.resize({ width: size, height: size, quality: 'best' }).toPNG(),
  }))
  fs.writeFileSync(path.join(OUT, 'icon.ico'), buildIco(pngs))

  console.log('ICON_OK png=' + fs.statSync(path.join(OUT, 'icon.png')).size +
              ' ico=' + fs.statSync(path.join(OUT, 'icon.ico')).size)
  app.quit()
})
