const test = require('node:test')
const assert = require('node:assert/strict')

const { createPrivacyService } = require('../electron/privacyService.cjs')

function fixture({ roomMode = 'standalone' } = {}) {
  const files = new Set(['C:\\lucent\\lucent-data.db', 'C:\\lucent\\lucent-data.db-wal', 'C:\\lucent\\lucent-data.db-shm', 'C:\\lucent\\config.json'])
  const calls = []
  let cookie = 'secret-cookie'
  const service = createPrivacyService({
    credentialStore: { hasStored: () => Boolean(cookie), save: (value) => { cookie = value } },
    fs: {
      existsSync: (file) => files.has(file),
      unlinkSync: (file) => { if (!files.delete(file)) { const error = new Error('missing'); error.code = 'ENOENT'; throw error } },
    },
    databasePath: 'C:\\lucent\\lucent-data.db',
    configPath: 'C:\\lucent\\config.json',
    closeDatabase: () => calls.push('close'),
    openDatabase: () => calls.push('open'),
    getRoomMode: () => roomMode,
    resetSettings: () => calls.push('reset'),
  })
  return { service, calls, files, getCookie: () => cookie }
}

test('privacy summary exposes only boolean local data flags', () => {
  const fx = fixture()
  const summary = fx.service.summary()
  assert.deepEqual(Object.keys(summary).sort(), ['accountStored', 'libraryStored', 'settingsStored'])
  assert.equal(JSON.stringify(summary).includes('secret-cookie'), false)
  assert.equal(JSON.stringify(summary).includes('C:\\lucent'), false)
})

test('library erase closes, removes exact SQLite sidecars, then recreates the store', () => {
  const fx = fixture()
  assert.deepEqual(fx.service.erase('library'), { ok: true, scope: 'library' })
  assert.deepEqual(fx.calls, ['close', 'open'])
  assert.equal([...fx.files].some((file) => file.includes('lucent-data.db')), false)
  assert.equal(fx.files.has('C:\\lucent\\config.json'), true)
})

test('library erase is rejected while hosting and local account erase never touches cloud data', () => {
  const fx = fixture({ roomMode: 'host' })
  assert.deepEqual(fx.service.erase('library'), { ok: false, error: '主持房間時不能清除本機歌單' })
  assert.deepEqual(fx.service.erase('account'), { ok: true, scope: 'account' })
  assert.equal(fx.getCookie(), '')
  assert.deepEqual(fx.calls, [])
})

test('settings erase removes only the persisted settings file and resets the live state', () => {
  const fx = fixture()
  assert.deepEqual(fx.service.erase('settings'), { ok: true, scope: 'settings' })
  assert.deepEqual(fx.calls, ['reset'])
  assert.equal(fx.files.has('C:\\lucent\\config.json'), false)
})
