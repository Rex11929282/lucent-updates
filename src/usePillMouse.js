import { useEffect, useState } from 'react'
import { localPointerForPill, pillMouseRect } from './pillMouse.js'

const NEUTRAL_MOUSE = {
  globalMousePos: { x: 0, y: 0 },
  mouseOffset: { x: 0, y: 0 },
}

export function usePillMouse(targetRef, distance, enabled = true) {
  const [mouse, setMouse] = useState(NEUTRAL_MOUSE)

  useEffect(() => {
    if (!enabled) {
      setMouse(NEUTRAL_MOUSE)
      return undefined
    }
    let frame = 0
    let pointer = null

    const paint = () => {
      frame = 0
      const target = targetRef.current
      if (!target || !pointer) return
      const rect = pillMouseRect(target)
      if (!rect?.width || !rect?.height) return
      const local = localPointerForPill(pointer, rect, distance)
      const edgeX = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right)
      const edgeY = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom)
      const edgeDistance = Math.hypot(edgeX, edgeY)
      const activationDistance = Math.max(0, Math.min(80, Number(distance) || 0))
      const proximity = local.active
        ? (activationDistance === 0 ? 1 : Math.max(0, 1 - edgeDistance / activationDistance))
        : 0
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      const next = local.active
        ? {
            globalMousePos: {
              x: centerX + (pointer.x - centerX) * proximity,
              y: centerY + (pointer.y - centerY) * proximity,
            },
            mouseOffset: {
              x: ((local.x - rect.width / 2) / Math.max(1, rect.width)) * 100 * proximity,
              y: ((local.y - rect.height / 2) / Math.max(1, rect.height)) * 100 * proximity,
            },
          }
        : NEUTRAL_MOUSE
      setMouse((current) => (
        current.globalMousePos.x === next.globalMousePos.x
          && current.globalMousePos.y === next.globalMousePos.y
          && current.mouseOffset.x === next.mouseOffset.x
          && current.mouseOffset.y === next.mouseOffset.y
          ? current
          : next
      ))
    }

    const onPointerMove = (event) => {
      pointer = { x: event.clientX, y: event.clientY }
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const onPointerOut = (event) => {
      if (event.relatedTarget) return
      pointer = null
      cancelAnimationFrame(frame)
      frame = 0
      setMouse(NEUTRAL_MOUSE)
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('mouseout', onPointerOut)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('mouseout', onPointerOut)
      cancelAnimationFrame(frame)
    }
  }, [targetRef, distance, enabled])

  return mouse
}
