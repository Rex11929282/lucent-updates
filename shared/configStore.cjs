// Reading the settings file is the one place where being "forgiving" costs the
// user real data. If the file cannot be parsed, the old code returned defaults
// and said nothing — and the next save overwrote the only copy. A truncated
// write from a power loss was therefore indistinguishable from a factory reset.
//
// The rule here: never discard bytes we could not understand. Rename them out
// of the way first, then start from defaults.

// Lucent writes this file without a byte order mark, but it is a plain JSON
// file sitting in AppData and people do open it in an editor. Notepad and most
// PowerShell redirections add a BOM on save, and JSON.parse rejects it. Without
// this, editing your own settings by hand resets every one of them.
function stripBom(text) {
  return typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function corruptBackupPath(configPath, stamp) {
  const safe = String(stamp || '').replace(/[:.]/g, '-') || 'unknown'
  return `${configPath}.corrupt-${safe}`
}

// `fs` is injected so this can be tested against a fake filesystem without
// touching the real config, and so a failure to back up never prevents startup.
function loadConfigFile({ fs, configPath, migrate, createDefault, stamp = '' }) {
  let raw = null
  try {
    raw = fs.readFileSync(configPath, 'utf-8')
  } catch {
    // First run, or the path is unreadable. There is nothing to preserve.
    return { state: createDefault(), outcome: 'default', backupPath: '', error: '' }
  }

  try {
    return { state: migrate(JSON.parse(stripBom(raw))), outcome: 'loaded', backupPath: '', error: '' }
  } catch (error) {
    let backupPath = ''
    try {
      backupPath = corruptBackupPath(configPath, stamp)
      fs.renameSync(configPath, backupPath)
    } catch {
      // Preserving is best-effort: a locked or read-only file must still let
      // the app start, it just cannot be moved aside.
      backupPath = ''
    }
    return {
      state: createDefault(),
      outcome: 'recovered',
      backupPath,
      error: String(error?.message || error || 'unreadable settings file'),
    }
  }
}

module.exports = { loadConfigFile, corruptBackupPath }
