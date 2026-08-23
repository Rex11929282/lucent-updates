const SCOPES = new Set(['account', 'library', 'settings'])

function removeExact(fs, file) {
  try { fs.unlinkSync(file) } catch (error) { if (error?.code !== 'ENOENT') throw error }
}

function createPrivacyService({ credentialStore, fs, databasePath, configPath, closeDatabase, openDatabase, getRoomMode, resetSettings }) {
  function summary() {
    return {
      accountStored: Boolean(credentialStore.hasStored()),
      libraryStored: [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].some((file) => fs.existsSync(file)),
      settingsStored: fs.existsSync(configPath),
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
