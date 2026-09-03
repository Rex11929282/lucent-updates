import { useCallback, useEffect, useRef } from 'react'

// 3D 卡片與按鈕的指標追蹤。
//
// 只寫 CSS 自訂屬性，實際的變形交給 CSS 用 transform 做 —— 全部在合成層，
// 不觸發 layout/paint。之前桌面藥丸就是因為每幀都去讀寬高而卡過，
// 這裡刻意只在 pointerenter 量一次尺寸，之後移動都只做算術。
//
// 寫入的變數：
//   --px, --py  指標在卡片內的位置（0~1）
//   --rx, --ry  要旋轉的角度（deg）
//   --dist      指標離中心的距離（0~1），拿來調高光強度
export function useCardTilt({ max = 7, enabled = true } = {}) {
  const ref = useRef(null)
  const box = useRef(null)
  const frame = useRef(0)
  const pending = useRef(null)

  const flush = useCallback(() => {
    frame.current = 0
    const el = ref.current
    const p = pending.current
    if (!el || !p) return
    el.style.setProperty('--px', p.px.toFixed(4))
    el.style.setProperty('--py', p.py.toFixed(4))
    el.style.setProperty('--rx', `${p.rx.toFixed(3)}deg`)
    el.style.setProperty('--ry', `${p.ry.toFixed(3)}deg`)
    el.style.setProperty('--dist', p.dist.toFixed(4))
  }, [])

  const onPointerEnter = useCallback((event) => {
    if (!enabled) return
    box.current = event.currentTarget.getBoundingClientRect()
    event.currentTarget.classList.add('is-tilting')
  }, [enabled])

  const onPointerMove = useCallback((event) => {
    if (!enabled) return
    const b = box.current || event.currentTarget.getBoundingClientRect()
    box.current = b
    if (!b.width || !b.height) return
    const px = (event.clientX - b.left) / b.width
    const py = (event.clientY - b.top) / b.height
    // 中心為 0，邊緣為 ±1
    const cx = px * 2 - 1
    const cy = py * 2 - 1
    pending.current = {
      px, py,
      // 游標在上方 → 卡片上緣往後倒，所以 rx 用 -cy
      rx: -cy * max,
      ry: cx * max,
      dist: Math.min(1, Math.hypot(cx, cy)),
    }
    if (!frame.current) frame.current = requestAnimationFrame(flush)
  }, [enabled, max, flush])

  const onPointerLeave = useCallback((event) => {
    box.current = null
    pending.current = null
    if (frame.current) { cancelAnimationFrame(frame.current); frame.current = 0 }
    const el = event.currentTarget
    el.classList.remove('is-tilting')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--dist', '0')
  }, [])

  useEffect(() => () => {
    if (frame.current) cancelAnimationFrame(frame.current)
  }, [])

  if (!enabled) return { ref: undefined, handlers: {} }
  return { ref, handlers: { onPointerEnter, onPointerMove, onPointerLeave } }
}

// 按鈕按下時從「實際被點到的那一點」擴散漣漪。
// 不用 state，直接操作 DOM —— 一次點擊不該讓整個 React 樹重繪。
export function spawnRipple(el, clientX, clientY) {
  if (!el || el.dataset.noRipple === 'true') return
  const b = el.getBoundingClientRect()
  if (!b.width || !b.height) return
  const dot = document.createElement('span')
  dot.className = 'ripple'
  // 半徑取到最遠的角落，漣漪才會蓋滿整顆按鈕
  const size = Math.hypot(
    Math.max(clientX - b.left, b.right - clientX),
    Math.max(clientY - b.top, b.bottom - clientY),
  ) * 2
  dot.style.width = `${size}px`
  dot.style.height = `${size}px`
  dot.style.left = `${clientX - b.left - size / 2}px`
  dot.style.top = `${clientY - b.top - size / 2}px`
  el.append(dot)
  dot.addEventListener('animationend', () => dot.remove(), { once: true })
}

// 用事件委派掛一次就好，不必去改每一顆按鈕。
export function attachRipples(root, enabled = true) {
  if (!root || !enabled) return () => {}
  const onDown = (event) => {
    if (event.button !== 0) return
    const el = event.target.closest?.('.btn, .mini-action')
    if (el && root.contains(el) && !el.disabled) spawnRipple(el, event.clientX, event.clientY)
  }
  root.addEventListener('pointerdown', onDown)
  return () => root.removeEventListener('pointerdown', onDown)
}

export const CONSOLE_MOTION_MODES = ['full', 'subtle', 'off']

// full   完整：3D 傾斜、高光、漣漪、光暈
// subtle 收斂：只留按下的回饋與淡淡的高光，不做傾斜
// off    關閉：完全靜態
export function resolveConsoleMotion(preference) {
  return CONSOLE_MOTION_MODES.includes(preference) ? preference : 'full'
}
