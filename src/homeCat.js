export const HOME_CAT_SLEEP_AFTER_MS = 28_000

// sprite sheet 的動作列順序，必須與 scripts/makeCatSprite.cjs 的 ORDER 一致。
export const HOME_CAT_ACTIONS = ['idle', 'walk', 'run', 'jump', 'eat', 'groom', 'stretch', 'sleep']

// 每個動作的表現參數：
//   row    對應 sprite sheet 的第幾列
//   frames 這個動作要播幾格（走/跑是完整 8 格循環，跳只播一次）
//   ms     一輪動畫的長度
//   hold   這個動作要維持多久才換下一個
//   moves  是否會讓貓移動到新的位置
//   loop   false = 播一次就停在最後一格
export const HOME_CAT_ACTION_SPEC = {
  idle:    { row: 0, frames: 8, ms: 1600, hold: 3400, moves: false, loop: true },
  walk:    { row: 1, frames: 8, ms: 900,  hold: 4200, moves: true,  loop: true },
  run:     { row: 2, frames: 8, ms: 520,  hold: 2400, moves: true,  loop: true },
  jump:    { row: 3, frames: 8, ms: 820,  hold: 900,  moves: true,  loop: false },
  eat:     { row: 4, frames: 8, ms: 1100, hold: 4200, moves: false, loop: true },
  groom:   { row: 5, frames: 8, ms: 1400, hold: 4600, moves: false, loop: true },
  stretch: { row: 6, frames: 8, ms: 1500, hold: 2600, moves: false, loop: false },
  sleep:   { row: 7, frames: 8, ms: 2600, hold: 6200, moves: false, loop: true },
}

export const HOME_CAT_MOTION_MODES = ['full', 'gentle', 'auto', 'off']

// 貓咪動畫的開關。
//
// 背景：Windows 的「動畫效果」關掉時，Chromium 會回報
// prefers-reduced-motion: reduce。原本的樣式一律用 animation:none !important
// 把貓凍住，使用者只會看到一隻完全不動的貓，也不知道為什麼。
// 所以改成可以自己選：
//   full   完整動作（會在畫面上走來走去）
//   gentle 溫和：只做原地動作，不跨畫面移動
//   auto   跟隨系統：系統要求減少動態時自動降成 gentle
//   off    完全靜止
export function resolveHomeCatMotion({ preference = 'full', osReducedMotion = false } = {}) {
  const mode = HOME_CAT_MOTION_MODES.includes(preference) ? preference : 'full'
  if (mode === 'auto') return osReducedMotion ? 'gentle' : 'full'
  return mode
}

export function clampHomeCatX(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0.5
  return Math.max(0, Math.min(1, number))
}

export function homeCatActionSpec(action) {
  return HOME_CAT_ACTION_SPEC[action] || HOME_CAT_ACTION_SPEC.idle
}

// 依機率挑下一個動作。走路權重最高，因為那是最耐看的常態；
// 跳／伸懶腰是偶爾出現的點綴。
export function nextHomeCatAction({ homeVisible, appVisible, inactiveMs = 0, roll = Math.random() } = {}) {
  if (!homeVisible || !appVisible) return 'idle'
  if (inactiveMs >= HOME_CAT_SLEEP_AFTER_MS) return 'sleep'
  if (roll < 0.30) return 'walk'
  if (roll < 0.46) return 'run'
  if (roll < 0.58) return 'jump'
  if (roll < 0.70) return 'eat'
  if (roll < 0.82) return 'groom'
  if (roll < 0.90) return 'stretch'
  return 'idle'
}
