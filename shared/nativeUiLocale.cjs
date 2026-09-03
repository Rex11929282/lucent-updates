// Labels used by Electron-native menus. Renderer translations cannot be
// imported from the main process, so this small table stays independent.

const SUPPORTED_NATIVE_LOCALES = Object.freeze([
  'en-US', 'zh-TW', 'zh-CN', 'ja-JP', 'ko-KR',
  'es-ES', 'fr-FR', 'de-DE', 'pt-BR', 'ru-RU', 'it-IT',
])

const LABELS = Object.freeze({
  'en-US': Object.freeze({
    openConsole: 'Open console',
    showLucent: 'Show Lucent',
    hideLucent: 'Hide Lucent',
    quit: 'Exit completely',
    lockPosition: 'Lock position (cannot move)',
  }),
  'zh-TW': Object.freeze({
    openConsole: '開啟控制台',
    showLucent: '顯示璃音',
    hideLucent: '隱藏璃音',
    quit: '徹底結束',
    lockPosition: '鎖定位置（不能移動）',
  }),
  'zh-CN': Object.freeze({
    openConsole: '打开控制台',
    showLucent: '显示璃音',
    hideLucent: '隐藏璃音',
    quit: '完全退出',
    lockPosition: '锁定位置（不能移动）',
  }),
  'ja-JP': Object.freeze({
    openConsole: 'コンソールを開く',
    showLucent: 'Lucent を表示',
    hideLucent: 'Lucent を隠す',
    quit: '完全終了',
    lockPosition: '位置を固定（移動不可）',
  }),
  'ko-KR': Object.freeze({
    openConsole: '콘솔 열기',
    showLucent: 'Lucent 표시',
    hideLucent: 'Lucent 숨기기',
    quit: '완전히 종료',
    lockPosition: '위치 잠금(이동 불가)',
  }),
  'es-ES': Object.freeze({
    openConsole: 'Abrir consola',
    showLucent: 'Mostrar Lucent',
    hideLucent: 'Ocultar Lucent',
    quit: 'Salir por completo',
    lockPosition: 'Bloquear posición (no mover)',
  }),
  'fr-FR': Object.freeze({
    openConsole: 'Ouvrir la console',
    showLucent: 'Afficher Lucent',
    hideLucent: 'Masquer Lucent',
    quit: 'Quitter complètement',
    lockPosition: 'Verrouiller la position (déplacement désactivé)',
  }),
  'de-DE': Object.freeze({
    openConsole: 'Konsole öffnen',
    showLucent: 'Lucent anzeigen',
    hideLucent: 'Lucent ausblenden',
    quit: 'Vollständig beenden',
    lockPosition: 'Position sperren (nicht verschieben)',
  }),
  'pt-BR': Object.freeze({
    openConsole: 'Abrir console',
    showLucent: 'Mostrar Lucent',
    hideLucent: 'Ocultar Lucent',
    quit: 'Sair completamente',
    lockPosition: 'Bloquear posição (não mover)',
  }),
  'ru-RU': Object.freeze({
    openConsole: 'Открыть консоль',
    showLucent: 'Показать Lucent',
    hideLucent: 'Скрыть Lucent',
    quit: 'Полностью выйти',
    lockPosition: 'Заблокировать положение (не перемещать)',
  }),
  'it-IT': Object.freeze({
    openConsole: 'Apri console',
    showLucent: 'Mostra Lucent',
    hideLucent: 'Nascondi Lucent',
    quit: 'Esci completamente',
    lockPosition: 'Blocca posizione (non spostare)',
  }),
})

const LANGUAGE_DEFAULT = Object.freeze({
  en: 'en-US', zh: 'zh-CN', ja: 'ja-JP', ko: 'ko-KR', es: 'es-ES',
  fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', ru: 'ru-RU', it: 'it-IT',
})
const TRADITIONAL_REGIONS = new Set(['TW', 'HK', 'MO'])
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key)

function resolveNativeLocale(preference, systemLocale = 'en-US') {
  const preferred = String(preference || '').trim().replace(/_/g, '-')
  const raw = preferred && preferred !== 'auto'
    ? preferred
    : String(systemLocale || 'en-US').trim().replace(/_/g, '-')
  if (hasOwn(LABELS, raw)) return raw

  const parts = raw.split('-')
  const language = (parts[0] || '').toLowerCase()
  if (language === 'zh') {
    const tags = parts.slice(1).map((part) => part.toUpperCase())
    if (tags.includes('HANT') || tags.some((part) => TRADITIONAL_REGIONS.has(part))) return 'zh-TW'
    if (tags.includes('HANS')) return 'zh-CN'
  }
  return hasOwn(LANGUAGE_DEFAULT, language) ? LANGUAGE_DEFAULT[language] : 'en-US'
}

function nativeUiLabels(preference, systemLocale = 'en-US') {
  return LABELS[resolveNativeLocale(preference, systemLocale)] || LABELS['en-US']
}

module.exports = { nativeUiLabels, resolveNativeLocale, SUPPORTED_NATIVE_LOCALES }
