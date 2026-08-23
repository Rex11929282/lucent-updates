const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createCredentialStore } = require('../electron/credentialStore.cjs')

function fixture(encryptionAvailable = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lucent-credential-'))
  const encryptedPath = path.join(dir, 'credential.bin')
  const legacyPath = path.join(dir, 'cookie.txt')
  const safeStorage = {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString: (value) => Buffer.from(value, 'utf8').map((byte) => byte ^ 0x5a),
    decryptString: (buffer) => Buffer.from(buffer).map((byte) => byte ^ 0x5a).toString('utf8'),
  }
  const store = createCredentialStore({ safeStorage, fs, encryptedPath, legacyPath })
  return { dir, encryptedPath, legacyPath, store }
}

test('a legacy plaintext cookie migrates only after encrypted storage succeeds', () => {
  const fx = fixture()
  fs.writeFileSync(fx.legacyPath, 'MUSIC_U=secret-cookie')
  assert.equal(fx.store.load(), 'MUSIC_U=secret-cookie')
  assert.equal(fs.existsSync(fx.legacyPath), false)
  assert.notEqual(fs.readFileSync(fx.encryptedPath, 'utf8'), 'MUSIC_U=secret-cookie')
  assert.equal(fx.store.load(), 'MUSIC_U=secret-cookie')
  fs.rmSync(fx.dir, { recursive: true, force: true })
})

test('unavailable encryption keeps the legacy file and still permits the current session', () => {
  const fx = fixture(false)
  fs.writeFileSync(fx.legacyPath, 'legacy-session')
  assert.equal(fx.store.load(), 'legacy-session')
  assert.equal(fs.existsSync(fx.legacyPath), true)
  assert.equal(fs.existsSync(fx.encryptedPath), false)
  assert.throws(() => fx.store.save('new-cookie'), /系統加密目前不可用/)
  fs.rmSync(fx.dir, { recursive: true, force: true })
})

test('logout removes both encrypted and legacy credentials', () => {
  const fx = fixture()
  fs.writeFileSync(fx.legacyPath, 'old')
  fx.store.save('new')
  fs.writeFileSync(fx.legacyPath, 'stale')
  fx.store.save('')
  assert.equal(fs.existsSync(fx.encryptedPath), false)
  assert.equal(fs.existsSync(fx.legacyPath), false)
  fs.rmSync(fx.dir, { recursive: true, force: true })
})

test('encrypted credential bytes never contain the original cookie', () => {
  const fx = fixture()
  fx.store.save('MUSIC_U=top-secret')
  const bytes = fs.readFileSync(fx.encryptedPath)
  assert.equal(bytes.includes(Buffer.from('MUSIC_U=top-secret')), false)
  fs.rmSync(fx.dir, { recursive: true, force: true })
})

test('main process uses safeStorage instead of reading or writing a plaintext cookie file', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron', 'main.cjs'), 'utf8')
  assert.match(main, /safeStorage/)
  assert.match(main, /createCredentialStore/)
  assert.doesNotMatch(main, /COOKIE_PATH/)
  assert.doesNotMatch(main, /netease-cookie\.txt[^\n]*writeFileSync/)
})
