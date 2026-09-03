#!/usr/bin/env node
// 產生首頁桌寵的 sprite sheet 與藥丸的唱片頭像。
//
// 貓不是一格一格手排像素畫出來的 —— 手排的上限就是簡筆畫。
// 這裡是「骨架 → 體積 → 光照／虎斑／描邊 → 量化成有限毛色階」的算圖流程：
//   scripts/catRender.cjs  怎麼把一副骨架算成一格圖
//   scripts/catPoses.cjs   每個動作每一格的骨架長什麼樣
// 所以改姿勢只要動關節座標，動作之間也是連續的。
//
// 用法：node scripts/makeCatSprite.cjs
const fs = require('node:fs')
const path = require('node:path')
const { CELL, renderPose } = require('./catRender.cjs')
const { ACTIONS, ORDER } = require('./catPoses.cjs')
const { encodePNG } = require('./png.cjs')

const COLS = 8

// ---------- sprite sheet ----------
const sheetW = COLS * CELL
const sheetH = ORDER.length * CELL
const sheet = Array.from({ length: sheetH }, () => Array.from({ length: sheetW }, () => null))

ORDER.forEach((name, row) => {
  const frames = ACTIONS[name]
  if (!frames || frames.length !== COLS) {
    throw new Error(`${name} 應該有 ${COLS} 格，實際 ${frames ? frames.length : 0} 格`)
  }
  frames.forEach((pose, col) => {
    const cell = renderPose(pose)
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        sheet[row * CELL + y][col * CELL + x] = cell[y][x]
      }
    }
  })
})

const spritePath = path.join(__dirname, '..', 'public', 'lucent-cat-sprite.png')
const spritePng = encodePNG(sheet)
fs.writeFileSync(spritePath, spritePng)
process.stdout.write(`${spritePath}\n${sheetW}x${sheetH}, ${ORDER.length} actions x ${COLS} frames, ${(spritePng.length / 1024).toFixed(1)} KB\n`)

// ---------- 唱片頭像 ----------
// 藥丸左邊的唱片會旋轉，所以主體必須置中；實際只有 40~50px，
// 用同一隻貓的臉，讓藥丸和首頁的桌寵看起來是同一隻。
const AV = 256
const AV_LABEL_R = 96
const avatar = Array.from({ length: AV }, () => Array.from({ length: AV }, () => null))

// 黑膠底盤與溝紋
for (let y = 0; y < AV; y += 1) {
  for (let x = 0; x < AV; x += 1) {
    const dx = x - AV / 2
    const dy = y - AV / 2
    const r = Math.hypot(dx, dy)
    if (r > AV / 2) continue
    if (r <= AV_LABEL_R) {
      // 標籤：暖色徑向漸層
      const t = r / AV_LABEL_R
      const shade = 1 - t * 0.32
      const base = [255, 232, 190]
      avatar[y][x] = rgb(base.map((c) => Math.round(c * shade)))
      if (r > AV_LABEL_R - 3) avatar[y][x] = '#2f2a24'
    } else {
      const groove = Math.sin(r * 0.9) > 0.6 ? 0.86 : 1
      const v = Math.round(38 * groove)
      avatar[y][x] = rgb([v, v - 4, v - 2])
    }
    if (r > AV / 2 - 2) avatar[y][x] = '#1b1714'
  }
}

// 把貓臉（用 idle 第 0 格的頭）放大貼到標籤中央
const faceCell = renderPose(ACTIONS.idle[0])
// 只取頭部區域：找出頭附近的外接框
const HEAD_BOX = { x0: 40, y0: 6, x1: 64, y1: 32 }
const fw = HEAD_BOX.x1 - HEAD_BOX.x0
const fh = HEAD_BOX.y1 - HEAD_BOX.y0
const scale = 5
const ox = Math.round(AV / 2 - (fw * scale) / 2)
const oy = Math.round(AV / 2 - (fh * scale) / 2) + 4
for (let y = 0; y < fh; y += 1) {
  for (let x = 0; x < fw; x += 1) {
    const c = faceCell[HEAD_BOX.y0 + y][HEAD_BOX.x0 + x]
    if (!c) continue
    for (let sy = 0; sy < scale; sy += 1) {
      for (let sx = 0; sx < scale; sx += 1) {
        const px = ox + x * scale + sx
        const py = oy + y * scale + sy
        if (px < 0 || py < 0 || px >= AV || py >= AV) continue
        avatar[py][px] = c
      }
    }
  }
}
// 中心軸孔
for (let y = 0; y < AV; y += 1) {
  for (let x = 0; x < AV; x += 1) {
    if (Math.hypot(x - AV / 2, y - AV / 2) <= 7) avatar[y][x] = '#1b1714'
  }
}

function rgb([r, g, b]) {
  const h = (v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

// 放在 src/assets 而不是 public：畫面端是用 JS import 引用它的，
// 交給 Vite 解析才會產出正確的相對路徑。寫死 '/lucent-avatar.png' 的話，
// 打包後用 file:// 開會被解讀成 file:///D:/lucent-avatar.png 而載不到。
const avatarPath = path.join(__dirname, '..', 'src', 'assets', 'lucent-avatar.png')
const avatarPng = encodePNG(avatar)
fs.writeFileSync(avatarPath, avatarPng)
process.stdout.write(`${avatarPath}\n${AV}x${AV} 唱片頭像, ${(avatarPng.length / 1024).toFixed(1)} KB\n`)

module.exports = { ORDER, CELL, COLS }
