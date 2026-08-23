export function localPointerForPill(pointer, rect, distance = 14) {
  if (!rect || !Number.isFinite(pointer?.x) || !Number.isFinite(pointer?.y)) {
    return { x: 0, y: 0, active: false }
  }
  const activationDistance = Math.max(0, Math.min(80, Number(distance) || 0))
  const edgeX = Math.max(rect.left - pointer.x, 0, pointer.x - rect.right)
  const edgeY = Math.max(rect.top - pointer.y, 0, pointer.y - rect.bottom)
  const active = Math.hypot(edgeX, edgeY) <= activationDistance
  return active
    ? { x: pointer.x - rect.left, y: pointer.y - rect.top, active: true }
    : { x: 0, y: 0, active: false }
}

export function pillMouseRect(wrapper) {
  if (!wrapper) return null
  const visibleSurface = wrapper.querySelector?.('.glass') || wrapper.querySelector?.('.plain')
  return (visibleSurface || wrapper).getBoundingClientRect?.() || null
}
