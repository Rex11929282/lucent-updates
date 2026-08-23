export const VINYL_FRAMES = Object.freeze([
  { id: 'none', label: '無', url: '' },
  { id: 'hologram', label: '幻彩星環', url: './frames/vinyl/hologram.png', coverScale: 0.75 },
  { id: 'wood', label: '復古木框', url: './frames/vinyl/wood.png', coverScale: 0.74 },
  { id: 'celestial', label: '星穹', url: './frames/vinyl/celestial.png', coverScale: 0.69 },
])

export function findVinylFrame(id) {
  return VINYL_FRAMES.find((frame) => frame.id === id) || VINYL_FRAMES[0]
}
