export function pauseBreathActive({ enabled, playing, effectsPaused } = {}) {
  return enabled === true && playing !== true && effectsPaused !== true
}
