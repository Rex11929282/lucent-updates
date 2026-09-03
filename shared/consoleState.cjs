const PAGES = new Set(['home', 'play', 'look', 'room', 'settings', 'help'])
const THEMES = new Set(['system', 'light', 'dark'])
const CLOSE_BEHAVIORS = new Set(['ask', 'pill', 'tray', 'quit'])
const MOTION_MODES = new Set(['full', 'subtle', 'off'])
const LEGACY_PAGE = { play: 'play', look: 'look', room: 'room', system: 'settings' }

function normalizeConsoleState(value = {}, legacyWorkbench = {}) {
  const page = PAGES.has(value.selectedPage)
    ? value.selectedPage
    : LEGACY_PAGE[legacyWorkbench?.activeModule] || 'home'

  return {
    selectedPage: page,
    onboardingVersion: Number.isInteger(value.onboardingVersion) && value.onboardingVersion >= 0
      ? value.onboardingVersion
      : 0,
    theme: THEMES.has(value.theme) ? value.theme : 'system',
    motion: MOTION_MODES.has(value.motion) ? value.motion : 'full',
    startupView: value.startupView === 'pill' ? 'pill' : 'console',
    closeBehavior: CLOSE_BEHAVIORS.has(value.closeBehavior) ? value.closeBehavior : 'ask',
    launchAtLogin: value.launchAtLogin === true,
    appearanceSection: typeof value.appearanceSection === 'string' ? value.appearanceSection : 'quick',
  }
}

module.exports = { normalizeConsoleState }
