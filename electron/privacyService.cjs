const SCOPES = new Set(['account', 'library', 'settings'])

function removeExact(fs, file) {
  try { fs.unlinkSync(file) } catch (error) { if (error?.code !== 'ENOENT') throw error }
}

// When the settings file cannot be parsed it is renamed to
// `<config>.corrupt-<timestamp>` instead of being thrown away, so a truncated
// write does not silently erase every profile. Those backups hold the same
// personal data as the settings file itself — appearance profiles, room names,
// window position — so "erase my settings" has to remove them too, otherwise
// the recovery feature quietly defeats the privacy feature.
function corruptBackupsOf(fs, configPath) {
  const separator = Math.max(configPath.lastIndexOf('/'), configPath.lastIndexOf('\\'))
  const directory = separator >= 0 ? configPath.slice(0, separator) : '.'
  const prefix = `${separator >= 0 ? configPath.slice(separator + 1) : configPath}.corrupt-`
  try {
    return fs.readdirSync(directory)
      .filter((name) => name.startsWith(prefix))
      .map((name) => `${directory}${separator >= 0 ? configPath[separator] : '/'}${name}`)
  } catch {
    return []
  }
}

function createPrivacyService({ credentialStore, fs, databasePath, configPath, closeDatabase, openDatabase, getRoomMode, resetSettings }) {
  function summary() {
    return {
      accountStored: Boolean(credentialStore.hasStored()),
      libraryStored: [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].some((file) => fs.existsSync(file)),
      settingsStored: fs.existsSync(configPath) || corruptBackupsOf(fs, configPath).length > 0,
    }
  }

  function erase(scope) {
    if (!SCOPES.has(scope)) return { ok: false, error: '資料範圍無效' }
    if (scope === 'library' && getRoomMode() === 'host') return { ok: false, error: '主持房間時不能清除本機歌單' }
    try {
      if (scope === 'account') credentialStore.save('')
      if (scope === 'library') {
        closeDatabase()
        for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) removeExact(fs, file)
        openDatabase()
      }
      if (scope === 'settings') {
        removeExact(fs, configPath)
        for (const backup of corruptBackupsOf(fs, configPath)) removeExact(fs, backup)
        resetSettings()
      }
      return { ok: true, scope }
    } catch {
      return { ok: false, error: '本機資料清除失敗' }
    }
  }

  return { summary, erase }
}

module.exports = { createPrivacyService }
