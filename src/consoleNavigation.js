export const CONSOLE_PAGE_IDS = Object.freeze(['home', 'play', 'look', 'room', 'settings', 'help'])

export function normalizeConsolePage(value) {
  return CONSOLE_PAGE_IDS.includes(value) ? value : 'home'
}
