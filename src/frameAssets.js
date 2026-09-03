export const VINYL_FRAMES = Object.freeze([
  { id: 'none', label: '無外框', url: '', kind: 'bare' },
  { id: 'classic', label: '經典金色唱片', url: '', kind: 'classic' },
  { id: 'hologram', label: '幻彩星環', url: './frames/vinyl/hologram.png', coverScale: 0.75, kind: 'frame' },
  { id: 'wood', label: '復古木框', url: './frames/vinyl/wood.png', coverScale: 0.74, kind: 'frame' },
  { id: 'celestial', label: '星穹', url: './frames/vinyl/celestial.png', coverScale: 0.69, kind: 'frame' },
])

export function findVinylFrame(id) {
  return VINYL_FRAMES.find((frame) => frame.id === id) || VINYL_FRAMES[0]
}
