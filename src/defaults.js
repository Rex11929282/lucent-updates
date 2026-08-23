// 設定的單一真相來源在 shared/defaults.json（主行程與畫面端共用同一份），
// 避免預設值在兩處平行維護而漂移。
import schema from '../shared/defaults.json'

export const SCHEMA_VERSION = schema.schemaVersion

export const DEFAULT_STATE = {
  glass: { ...schema.glass },
  cfg: { ...schema.cfg },
  profiles: [...schema.profiles],
  updates: { ...schema.updates },
  ui: JSON.parse(JSON.stringify(schema.ui)),
  lyricsRaw: schema.lyricsRaw,
}

// Reset 按鈕用：還原成 rdev/liquid-glass-react demo 的原始預設
export const GLASS_DEFAULTS = { ...schema.glassResetPreset }
