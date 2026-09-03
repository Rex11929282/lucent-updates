// 貓咪算圖核心：把一副骨架算成一格像素圖。
//
// 為什麼不是手排像素：手排的上限就是「一塊一塊的色塊」，再怎麼畫都像簡筆畫。
// 這裡改成先用「帶粗細變化的骨頭（capsule）」堆出體積，再做光照、虎斑、
// 腹部漸層與描邊，最後量化到一組有限的毛色階 —— 這樣既有真實的立體感，
// 又還是乾淨的像素風，而且改姿勢只要改關節座標。

const CELL = 64 // 每格 64×64，比手排的 32 多一倍細節

// 毛色階（暗 → 亮）。量化到這組色階是「看起來像素風」的關鍵：
// 有陰影層次，但不會糊成照片。
const FUR = ['#241f1b', '#332c25', '#463c30', '#5c4f3e', '#75664e', '#8e7d60', '#a89572', '#bfac88', '#d2c09c']
// 腹部／胸口／腳掌的奶油色階
const CREAM = ['#8f8168', '#b3a488', '#cdbfa4', '#e2d7bf', '#f2ead8']
const INK = '#1b1714' // 描邊
const PINK = '#d99a92'
const NOSE = '#b0736a'
const EYE = '#a8bd5e'
const EYE_DARK = '#4a5626'
const PUPIL = '#17150f'
const GLINT = '#f6f2e4'
const WHISKER = '#efe7d6'

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, t) => a + (b - a) * t
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]

function segClosest(px, py, a, b) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy || 1e-6
  const t = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / len2, 0, 1)
  return { t, x: a[0] + dx * t, y: a[1] + dy * t }
}

// 帶錐度的骨頭：半徑從 r0 漸變到 r1
function capsuleSD(px, py, a, b, r0, r1) {
  const c = segClosest(px, py, a, b)
  const r = lerp(r0, r1, c.t)
  return { sd: Math.hypot(px - c.x, py - c.y) - r, t: c.t, r, cy: c.y }
}

function ellipseSD(px, py, c, rx, ry) {
  const nx = (px - c[0]) / rx
  const ny = (py - c[1]) / ry
  const d = Math.hypot(nx, ny)
  return { sd: (d - 1) * Math.min(rx, ry), ny: clamp(ny, -1, 1), nx: clamp(nx, -1, 1) }
}

// 穩定的雜訊：同一個座標永遠得到同一個值。
// 不能用 Math.random —— 每次產生的圖都不一樣，動畫就會整片閃爍。
function hashNoise(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040888963407) | 0
  h = (h ^ (h >> 13)) * 1274126177
  return (((h ^ (h >> 16)) >>> 0) % 1000) / 1000
}

// 把「毛色階索引」轉成實際顏色；索引可以是小數，會夾到範圍內
const furAt = (i) => FUR[clamp(Math.round(i), 0, FUR.length - 1)]
const creamAt = (i) => CREAM[clamp(Math.round(i), 0, CREAM.length - 1)]

// 骨架 → 圖層清單。z 小的先畫（在後面）。
function partsOf(pose) {
  const p = pose
  return [
    { name: 'tail', z: 0, far: true, bones: p.tail },
    { name: 'legBackFar', z: 1, far: true, bones: p.legBackFar },
    { name: 'legFrontFar', z: 1, far: true, bones: p.legFrontFar },
    { name: 'body', z: 2, far: false, body: true },
    { name: 'legBackNear', z: 3, far: false, bones: p.legBackNear },
    { name: 'legFrontNear', z: 3, far: false, bones: p.legFrontNear },
    { name: 'head', z: 4, far: false, head: true },
  ]
}

// 算一格。回傳 CELL×CELL 的顏色字串陣列（null = 透明）。
function renderPose(pose) {
  const px = Array.from({ length: CELL }, () => Array.from({ length: CELL }, () => null))
  const parts = partsOf(pose).sort((a, b) => a.z - b.z)

  for (const part of parts) {
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const cx = x + 0.5
        const cy = y + 0.5
        const hit = samplePart(part, pose, cx, cy)
        if (!hit) continue
        px[y][x] = hit
      }
    }
  }
  drawFace(px, pose)
  return px
}

function samplePart(part, pose, x, y) {
  if (part.body) return sampleBody(pose, x, y)
  if (part.head) return sampleHead(pose, x, y)
  return sampleLimb(part, pose, x, y)
}

// --- 軀幹：沿脊椎的一串錐形骨頭，臀部粗、胸口次之、腰最細 ---
function sampleBody(pose, x, y) {
  const s = pose.spine
  let best = null
  for (let i = 0; i < s.length - 1; i += 1) {
    const a = s[i]
    const b = s[i + 1]
    const hit = capsuleSD(x, y, a.p, b.p, a.r, b.r)
    if (!best || hit.sd < best.sd) {
      best = { ...hit, seg: i, a, b }
    }
  }
  if (!best || best.sd > 0) return null

  // 沿脊椎的位置（0 = 尾端，1 = 肩），拿來排虎斑
  const along = (best.seg + best.t) / (s.length - 1)
  const centreY = best.cy
  const n = clamp((y - centreY) / Math.max(1, best.r), -1, 1) // -1 背 / +1 腹

  if (best.sd > -1.15) return INK // 描邊

  // 上方受光、下方入陰影。幅度不能太大，不然圓柱的明暗會蓋過虎斑，
  // 整隻貓看起來只有橫向的漸層而沒有紋路。
  let tone = 6.5 - n * 1.7

  // 鯖魚虎斑：垂直於脊椎的條紋，背上最深、往腹部淡掉
  const stripe = Math.sin(along * Math.PI * 2 * 6.5 + 0.6)
  const stripeFade = clamp(1 - (n + 0.15) * 1.5, 0, 1)
  if (stripe > 0.05) tone -= 3.4 * stripeFade * clamp((stripe - 0.05) / 0.95, 0, 1)

  // 背脊中線再壓深一點，看起來才有厚度
  if (n < -0.55) tone -= 0.5

  // 毛的細微雜訊（穩定）
  tone += (hashNoise(x | 0, y | 0, 3) - 0.5) * 0.7

  // 腹部／胸口轉成奶油色
  const bellyT = clamp((n - 0.28) / 0.6, 0, 1)
  if (bellyT > 0) {
    const cream = 1.1 + bellyT * 2.6 + (hashNoise(x | 0, y | 0, 7) - 0.5) * 0.6
    return creamAt(cream)
  }
  return furAt(tone)
}

// --- 頭：頭骨 + 口鼻 + 兩隻耳朵 ---
function sampleHead(pose, x, y) {
  const h = pose.head
  const skull = ellipseSD(x, y, h.c, h.rx, h.ry)
  const muzzle = ellipseSD(x, y, h.muzzle, h.mrx, h.mry)
  const ear = earSD(x, y, h.earL)
  const ear2 = earSD(x, y, h.earR)

  const cands = [
    { sd: skull.sd, kind: 'skull', n: skull.ny },
    { sd: muzzle.sd, kind: 'muzzle', n: muzzle.ny },
    { sd: ear, kind: 'ear', n: 0 },
    { sd: ear2, kind: 'ear2', n: 0 },
  ]
  const best = cands.reduce((m, c) => (c.sd < m.sd ? c : m))
  if (best.sd > 0) return null
  if (best.sd > -1.15) return INK

  if (best.kind === 'ear' || best.kind === 'ear2') {
    // 耳朵內側是粉紅、外緣是毛色
    const inner = best.sd < -2.2
    return inner ? PINK : furAt(5.4)
  }
  if (best.kind === 'muzzle') {
    return creamAt(2.9 + (hashNoise(x | 0, y | 0, 11) - 0.5) * 0.7)
  }
  // 額頭的 M 字虎斑
  let tone = 6.5 - best.n * 2.2
  const fx = (x - h.c[0]) / h.rx
  const fy = (y - h.c[1]) / h.ry
  if (fy < -0.15) {
    const m = Math.sin(fx * 7.5) // 額頭上的細紋
    if (m > 0.45) tone -= 2.2
  }
  // 眼角往後拉的深色線
  if (fy > -0.2 && fy < 0.15 && Math.abs(fx) > 0.55) tone -= 1.6
  tone += (hashNoise(x | 0, y | 0, 13) - 0.5) * 0.6
  return furAt(tone)
}

function earSD(x, y, ear) {
  // 耳朵＝一個往上收尖的三角形，用兩條邊的距離近似
  const { tip, base0, base1 } = ear
  const e0 = segClosest(x, y, base0, tip)
  const e1 = segClosest(x, y, base1, tip)
  const e2 = segClosest(x, y, base0, base1)
  // 用重心座標判斷內外
  const sign = pointInTriangle(x, y, tip, base0, base1) ? -1 : 1
  const d = Math.min(
    Math.hypot(x - e0.x, y - e0.y),
    Math.hypot(x - e1.x, y - e1.y),
    Math.hypot(x - e2.x, y - e2.y),
  )
  return sign * d
}

function pointInTriangle(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1])
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1])
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1])
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}

// --- 四肢與尾巴：一串錐形骨頭 ---
function sampleLimb(part, pose, x, y) {
  const bones = part.bones
  if (!bones) return null
  let best = null
  for (let i = 0; i < bones.length - 1; i += 1) {
    const a = bones[i]
    const b = bones[i + 1]
    const hit = capsuleSD(x, y, a.p, b.p, a.r, b.r)
    if (!best || hit.sd < best.sd) best = { ...hit, seg: i, a, b }
  }
  if (!best || best.sd > 0) return null
  if (best.sd > -1.05) return INK

  const along = (best.seg + best.t) / (bones.length - 1)
  const n = clamp((y - best.cy) / Math.max(1, best.r), -1, 1)
  let tone = 6.2 - n * 1.9
  // 遠側的腿壓暗，才有前後之分
  if (part.far) tone -= 2.1

  if (part.name === 'tail') {
    // 尾巴：環紋 + 尾端偏黑
    const ring = Math.sin(along * Math.PI * 2 * 5)
    if (ring > 0.1) tone -= 2.0
    if (along < 0.22) tone -= 3.2 // 尾端
  } else {
    // 腿上的橫紋，越靠腳掌越淡
    const ring = Math.sin(along * Math.PI * 2 * 3.2)
    if (ring > 0.35 && along < 0.55) tone -= 1.5
    // 腳掌是奶油色
    if (along > 0.82) {
      const cream = (part.far ? 0.6 : 2.2) + (1 - n) * 0.7
      return creamAt(cream)
    }
  }
  tone += (hashNoise(x | 0, y | 0, 17) - 0.5) * 0.6
  return furAt(tone)
}

// --- 臉：眼睛、鼻子、嘴、鬍鬚（畫在最上層）---
function put(px, x, y, colour) {
  const xi = Math.round(x)
  const yi = Math.round(y)
  if (xi < 0 || yi < 0 || xi >= CELL || yi >= CELL) return
  if (px[yi][xi] === null) return // 不畫到身體外面
  px[yi][xi] = colour
}

function drawFace(px, pose) {
  const f = pose.face
  if (!f || f.hidden) return
  for (const eye of [f.eyeL, f.eyeR]) {
    if (!eye) continue
    if (f.closed) {
      // 閉眼：一條下彎的線
      for (let i = -2; i <= 2; i += 1) {
        put(px, eye[0] + i, eye[1] + (Math.abs(i) === 2 ? -1 : 0), EYE_DARK)
      }
      continue
    }
    // 杏仁形的眼睛：外圈深色眼線、中間虹膜、直立瞳孔、一點高光。
    // 尺寸要小 —— 頭寬只有 20px，眼睛畫太大兩隻會連成一條綠帶。
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const inside = (dx * dx) / 4.6 + (dy * dy) / 1.5 <= 1
        if (!inside) continue
        const edge = (dx * dx) / 4.6 + (dy * dy) / 1.5 > 0.62
        put(px, eye[0] + dx, eye[1] + dy, edge ? EYE_DARK : EYE)
      }
    }
    put(px, eye[0], eye[1], PUPIL)          // 直立瞳孔
    put(px, eye[0] - 1, eye[1] - 1, GLINT)  // 高光
  }
  if (f.nose) {
    put(px, f.nose[0], f.nose[1], NOSE)
    put(px, f.nose[0] - 1, f.nose[1], NOSE)
    put(px, f.nose[0] + 1, f.nose[1], NOSE)
    put(px, f.nose[0], f.nose[1] + 1, NOSE)
    // 嘴：鼻下一條短線再往兩側分開
    put(px, f.nose[0], f.nose[1] + 2, EYE_DARK)
    put(px, f.nose[0] - 2, f.nose[1] + 3, EYE_DARK)
    put(px, f.nose[0] + 2, f.nose[1] + 3, EYE_DARK)
  }
  if (f.whisker) {
    // 只往臉的前方（右側）拉兩三根，而且必須從口鼻連續長出去。
    // 之前四個方向各拉一條，結果在臉旁邊畫出一個懸空的「X」。
    for (const [dy, len] of [[-1, 7], [0, 8], [1, 6]]) {
      let broke = false
      for (let i = 1; i <= len && !broke; i += 1) {
        const xi = Math.round(f.whisker[0] + i)
        const yi = Math.round(f.whisker[1] + dy * (i > 4 ? 1 : 0))
        if (xi < 0 || yi < 0 || xi >= CELL || yi >= CELL) break
        // 起點必須在身體上；離開身體之後才允許畫到背景
        if (i <= 2 && px[yi][xi] === null) { broke = true; break }
        px[yi][xi] = WHISKER
      }
    }
  }
}

module.exports = { CELL, renderPose, FUR, CREAM, INK, PINK, EYE, lerp, lerp2, clamp }
