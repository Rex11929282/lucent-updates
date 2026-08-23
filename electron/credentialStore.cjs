const path = require('node:path')

function createCredentialStore({ safeStorage, fs, encryptedPath, legacyPath }) {
  if (!safeStorage || !fs || !encryptedPath || !legacyPath) throw new TypeError('CredentialStore options are required')

  function remove(file) {
    try { fs.unlinkSync(file) } catch (error) { if (error?.code !== 'ENOENT') throw error }
  }

  function writeEncrypted(cookie) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('系統加密目前不可用')
    const encrypted = safeStorage.encryptString(String(cookie))
    fs.mkdirSync(path.dirname(encryptedPath), { recursive: true })
    const temporaryPath = `${encryptedPath}.tmp`
    fs.writeFileSync(temporaryPath, encrypted)
    fs.renameSync(temporaryPath, encryptedPath)
  }

  return {
    hasStored() {
      return fs.existsSync(encryptedPath) || fs.existsSync(legacyPath)
    },
    load() {
      try {
        if (fs.existsSync(encryptedPath)) {
          return safeStorage.decryptString(fs.readFileSync(encryptedPath))
        }
      } catch {
        return ''
      }

      let legacy = ''
      try { legacy = fs.readFileSync(legacyPath, 'utf8').trim() } catch {}
      if (!legacy) return ''
      if (!safeStorage.isEncryptionAvailable()) return legacy
      writeEncrypted(legacy)
      remove(legacyPath)
      return legacy
    },

    save(cookie) {
      const value = String(cookie || '').trim()
      if (!value) {
        remove(encryptedPath)
        remove(`${encryptedPath}.tmp`)
        remove(legacyPath)
        return
      }
      writeEncrypted(value)
      remove(legacyPath)
    },
  }
}

module.exports = { createCredentialStore }
