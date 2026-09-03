export function fitPreviewCapsule({ stageWidth, stageHeight, pillWidth, pillHeight, padding = 8 }) {
  const values = [stageWidth, stageHeight, pillWidth, pillHeight]
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return 1
  const availableWidth = Math.max(1, stageWidth - padding * 2)
  const availableHeight = Math.max(1, stageHeight - padding * 2)
  return Math.min(1, availableWidth / pillWidth, availableHeight / pillHeight)
}
