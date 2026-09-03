// 各動作的骨架。每個動作 8 格，格與格之間只是關節角度不同，
// 所以動作是連續的，而不是八張各自畫的圖。
const { clamp, lerp } = require('./catRender.cjs')

const GROUND = 55

// 站姿的基準骨架。座標是 64×64 格內的位置。
function standing({
  bob = 0,          // 身體上下起伏
  lean = 0,         // 身體前傾
  headDx = 0, headDy = 0,
  tailPhase = 0, tailLift = 0,
  legs,             // 四條腿的相位
  crouch = 0,       // 蹲低
  closed = false, blink = false,
} = {}) {
  const dy = bob + crouch
  // 脊椎：從尾根 → 臀 → 腰 → 肩 → 頸。半徑決定體型。
  const spine = [
    { p: [13, 34 + dy - lean * 0.2], r: 9.2 },   // 臀部最厚
    { p: [21, 33 + dy - lean * 0.3], r: 9.6 },
    { p: [30, 33.5 + dy - lean * 0.4], r: 8.4 }, // 腰略收
    { p: [38, 32.5 + dy - lean * 0.6], r: 9.0 }, // 胸口再撐開
    { p: [45, 30 + dy - lean * 0.8], r: 7.0 },   // 頸
  ]
  return withHead(spine, {
    hc: [52 + headDx, 21 + dy + headDy],
    dy, legs, tailPhase, tailLift, closed: closed || blink,
    ground: GROUND,
  })
}

// 頭、臉、四肢、尾巴 —— 站姿與伸懶腰共用
function withHead(spine, { hc, dy, legs, tailPhase, tailLift, closed, ground }) {
  const head = headAt(hc)
  const L = legs || { bf: 0, ff: 0.5, bn: 0.25, fn: 0.75 }
  return {
    spine,
    head,
    face: faceAt(hc, closed),
    legBackFar: backLeg(19.5, 37 + dy, L.bf, true, ground),
    legBackNear: backLeg(17, 37.5 + dy, L.bn, false, ground),
    legFrontFar: frontLeg(40, 36.5 + dy, L.ff, true, ground),
    legFrontNear: frontLeg(38, 37 + dy, L.fn, false, ground),
    tail: tail(11, 33 + dy, tailPhase, tailLift),
  }
}

// 頭骨大一點、口鼻往下移，眼睛才不會被淺色口鼻蓋掉。
// 耳朵底座放寬、尖端壓低，看起來才是長在頭上而不是兩根角。
function headAt(hc) {
  return {
    c: hc,
    rx: 10.0,
    ry: 9.2,
    muzzle: [hc[0] + 3.6, hc[1] + 5.8],
    mrx: 4.6,
    mry: 3.0,
    earL: {
      tip: [hc[0] - 6.0, hc[1] - 13.2],
      base0: [hc[0] - 10.0, hc[1] - 5.0],
      base1: [hc[0] - 1.2, hc[1] - 8.4],
    },
    earR: {
      tip: [hc[0] + 6.2, hc[1] - 12.6],
      base0: [hc[0] + 1.4, hc[1] - 8.4],
      base1: [hc[0] + 9.6, hc[1] - 4.4],
    },
  }
}

function faceAt(hc, closed) {
  return {
    eyeL: [hc[0] - 4.4, hc[1] - 1.0],
    eyeR: [hc[0] + 4.2, hc[1] - 0.6],
    nose: [hc[0] + 3.8, hc[1] + 4.6],
    whisker: [hc[0] + 7.2, hc[1] + 5.2],
    closed,
  }
}

// 後腿有明顯的大腿與跗關節（貓的後腿是 Z 字形）。
// 腿要短而結實 —— 太細太長會變成蜘蛛腳。
function backLeg(hx, hy, phase, far, ground = GROUND) {
  const swing = Math.sin(phase * Math.PI * 2)
  const lift = Math.max(0, Math.sin(phase * Math.PI * 2)) // 抬腳
  const pawX = hx - 1 + swing * 5
  const pawY = ground - lift * 4.5
  const knee = [hx - 3.6 + swing * 1.4, hy + 6]
  const hock = [hx - 0.8 + swing * 3.2, hy + 11.5 - lift * 2]
  const r = far ? 0.9 : 1
  return [
    { p: [hx, hy], r: 6.2 * r },
    { p: knee, r: 4.4 * r },
    { p: hock, r: 3.2 * r },
    { p: [pawX, pawY], r: 3.0 * r },
  ]
}

function frontLeg(hx, hy, phase, far, ground = GROUND) {
  const swing = Math.sin(phase * Math.PI * 2)
  const lift = Math.max(0, Math.sin(phase * Math.PI * 2))
  const pawX = hx + swing * 4.5
  const pawY = ground - lift * 4
  const r = far ? 0.9 : 1
  return [
    { p: [hx, hy], r: 5.0 * r },
    { p: [hx + swing * 1.6, hy + 7], r: 3.6 * r },
    { p: [pawX, pawY], r: 3.0 * r },
  ]
}

function tail(bx, by, phase, lift) {
  const s = Math.sin(phase * Math.PI * 2)
  // 從尾根往後上方甩，尾端最細
  return [
    { p: [bx - 9 + s * 2.2, by - 12 - lift * 5 + s * 3.5], r: 1.5 }, // 尾端
    { p: [bx - 8.5 + s * 1.6, by - 6 - lift * 4 + s * 2.4], r: 2.0 },
    { p: [bx - 6.5 + s * 1.0, by - 1 - lift * 2.5 + s * 1.4], r: 2.6 },
    { p: [bx - 2.5, by + 1], r: 3.2 },
    { p: [bx + 2, by + 0.5], r: 3.6 }, // 尾根最粗
  ]
}

// 坐姿：後腿收在身下、前腿直立撐著
function sitting({ headDx = 0, headDy = 0, tailPhase = 0, blink = false, lick = false } = {}) {
  const spine = [
    { p: [17, 42], r: 9.0 },
    { p: [23, 39], r: 8.8 },
    { p: [30, 35], r: 7.8 },
    { p: [37, 31], r: 7.6 },
    { p: [42, 28], r: 6.2 },
  ]
  const hc = [50 + headDx, 19 + headDy]
  const tuckedBack = (x, r) => ([
    { p: [x, 42], r: 6.6 * r },
    { p: [x + 3, 49], r: 4.6 * r },
    { p: [x + 8, GROUND - 1], r: 3.2 * r },
  ])
  // 理毛時前腳抬到嘴邊
  const frontNear = lick
    ? [{ p: [37, 34], r: 4.6 }, { p: [42, 29], r: 3.4 }, { p: [47, 25.5], r: 2.8 }]
    : [{ p: [37, 34], r: 4.6 }, { p: [38, 45], r: 3.4 }, { p: [38.5, GROUND], r: 2.8 }]
  return {
    spine,
    head: headAt(hc),
    face: faceAt(hc, blink),
    legBackFar: tuckedBack(20, 0.9),
    legBackNear: tuckedBack(18, 1),
    legFrontFar: [{ p: [39, 34], r: 4.2 }, { p: [40, 45], r: 3.1 }, { p: [40.5, GROUND], r: 2.6 }],
    legFrontNear: frontNear,
    tail: tail(13, 45, tailPhase, -0.35),
  }
}

// 趴睡：捲成一團，頭枕在前腳上
function curled({ breath = 0 } = {}) {
  const y = 44 - breath
  const spine = [
    { p: [16, y + 2], r: 8.4 },
    { p: [23, y - 1], r: 9.0 },
    { p: [31, y - 1.5], r: 8.6 },
    { p: [38, y], r: 7.8 },
    { p: [43, y + 2], r: 6.0 },
  ]
  const hc = [47, y + 4]
  const lying = (x, r) => ([
    { p: [x, y + 5], r: 5.4 * r },
    { p: [x + 6, y + 9], r: 3.6 * r },
    { p: [x + 13, y + 10], r: 2.8 * r },
  ])
  return {
    spine,
    head: headAt(hc),
    face: faceAt(hc, true),
    legBackFar: lying(19, 0.88),
    legBackNear: lying(21, 1),
    legFrontFar: [{ p: [38, y + 7], r: 4.0 }, { p: [44, y + 10], r: 2.9 }, { p: [50, y + 11], r: 2.5 }],
    legFrontNear: [{ p: [39, y + 8], r: 4.2 }, { p: [45, y + 11], r: 3.0 }, { p: [52, y + 12], r: 2.6 }],
    // 尾巴繞到身體前面
    tail: [
      { p: [13, y + 13], r: 1.6 },
      { p: [8, y + 12], r: 2.1 },
      { p: [6, y + 8], r: 2.7 },
      { p: [8, y + 4], r: 3.2 },
      { p: [13, y + 2], r: 3.6 },
    ],
  }
}

const seq = (n, fn) => Array.from({ length: n }, (_, i) => fn(i, i / n))

const ACTIONS = {
  // 站著呼吸、甩尾、偶爾眨眼
  idle: seq(8, (i, t) => standing({
    bob: Math.sin(t * Math.PI * 2) * 0.6,
    tailPhase: t,
    tailLift: 0.1,
    blink: i === 5,
    legs: { bf: 0, ff: 0, bn: 0, fn: 0 },
  })),
  // 走路：對角步態，身體隨步伐微幅起伏
  walk: seq(8, (i, t) => standing({
    bob: Math.abs(Math.sin(t * Math.PI * 2)) * 0.9 - 0.4,
    tailPhase: t * 0.5,
    tailLift: 0.25,
    legs: { fn: t, bf: t + 0.25, ff: t + 0.5, bn: t + 0.75 },
  })),
  // 跑：步幅更大、身體壓低前傾、尾巴拉平
  run: seq(8, (i, t) => standing({
    bob: Math.sin(t * Math.PI * 4) * 1.6,
    lean: 2.2,
    crouch: 1.4,
    tailPhase: t,
    tailLift: -0.55,
    legs: { fn: t, ff: t + 0.12, bn: t + 0.5, bf: t + 0.62 },
  })),
  // 跳：蹲 → 蹬 → 滯空 → 落地
  jump: seq(8, (i) => {
    const arc = [1.6, 0.4, -4.5, -8.5, -9.5, -6.5, -1.5, 0.8][i]
    const tuck = arc < -3
    return standing({
      bob: arc,
      lean: tuck ? 3 : 1,
      tailPhase: 0.25,
      tailLift: tuck ? 0.75 : 0.2,
      legs: tuck
        ? { bf: 0.3, bn: 0.32, ff: 0.3, fn: 0.32 }
        : { bf: 0.5, bn: 0.5, ff: 0.5, fn: 0.5 },
    })
  }),
  // 吃：頭低到地面小口啄
  eat: seq(8, (i, t) => standing({
    headDx: 1.5,
    headDy: 16 + Math.sin(t * Math.PI * 4) * 2.2,
    tailPhase: t * 0.5,
    tailLift: 0,
    blink: true,
    legs: { bf: 0, ff: 0, bn: 0, fn: 0 },
  })),
  // 理毛：坐著舔前腳
  groom: seq(8, (i, t) => sitting({
    headDx: 1.5 + Math.sin(t * Math.PI * 2) * 1.2,
    headDy: 3.5 + Math.sin(t * Math.PI * 2) * 1.6,
    tailPhase: t * 0.5,
    blink: true,
    lick: true,
  })),
  // 伸懶腰：前腳往前推、背下壓、臀部翹起
  stretch: seq(8, (i) => {
    const k = [0, 0.4, 0.8, 1, 1, 0.8, 0.4, 0][i]
    const pose = standing({
      bob: k * 2.4,
      lean: -k * 2.5,
      headDx: k * 2.5,
      headDy: k * 4.5,
      tailPhase: 0.5,
      tailLift: 0.4 + k * 0.5,
      blink: k > 0.7,
      legs: { bf: 0, bn: 0, ff: 0, fn: 0 },
    })
    // 前腳往前伸直
    for (const leg of [pose.legFrontNear, pose.legFrontFar]) {
      leg[1].p[0] += k * 5
      leg[2].p[0] += k * 9
      leg[2].p[1] += k * 1.5
    }
    // 臀部翹高
    pose.spine[0].p[1] -= k * 2.2
    return pose
  }),
  // 睡：只有呼吸的起伏
  sleep: seq(8, (i, t) => curled({ breath: Math.sin(t * Math.PI * 2) * 0.7 })),
}

const ORDER = ['idle', 'walk', 'run', 'jump', 'eat', 'groom', 'stretch', 'sleep']

module.exports = { ACTIONS, ORDER, standing, sitting, curled, GROUND, clamp, lerp }
